import fs from 'node:fs';
import path from 'node:path';
import { fetchUserPlaylists, fetchPlaylistTracks } from './spotify';
import { audioExistsInR2, getR2PublicUrl } from './r2';
import { loadCache, saveCache, isCacheValid } from './cache';
import { loadOverrides } from './overrides';
import { deduplicateSongs } from './dedupe';
import { Manifest, PlaylistFile, Song } from '../../src/data/types';
import { sortPlaylists } from '../../src/data/loader';
import { CacheEntry, UnmatchedReportEntry } from './types';

async function runDataPipeline() {
  console.log('⚡ Starting Speed Song data pipeline...\n');

  const startTime = Date.now();
  const cache = loadCache();
  const overrides = loadOverrides();
  const unmatchedReport: UnmatchedReportEntry[] = [];

  // Load allowed playlists list if present
  const playlistsConfigPath = path.resolve(process.cwd(), 'data', 'playlists.json');
  let allowedPlaylistIds: Set<string> | null = null;
  if (fs.existsSync(playlistsConfigPath)) {
    try {
      const allowedList = JSON.parse(fs.readFileSync(playlistsConfigPath, 'utf-8')) as { id: string; name?: string }[];
      allowedPlaylistIds = new Set(allowedList.map((p) => p.id));
      console.log(`Loaded ${allowedPlaylistIds.size} profile playlists from data/playlists.json.`);
    } catch (e) {
      console.warn('Could not read data/playlists.json, processing all public playlists:', e);
    }
  }

  // 1. Fetch playlists from Spotify
  console.log('Fetching Spotify playlists...');
  const allPlaylists = await fetchUserPlaylists();
  
  // Filter by data/playlists.json if provided
  let filtered = allowedPlaylistIds
    ? allPlaylists.filter((p) => allowedPlaylistIds!.has(p.id))
    : allPlaylists;

  // Single playlist override via env
  if (process.env.PLAYLIST_ID) {
    filtered = filtered.filter((p) => p.id === process.env.PLAYLIST_ID);
  }

  const limitPlaylists = process.env.LIMIT_PLAYLISTS ? parseInt(process.env.LIMIT_PLAYLISTS, 10) : undefined;
  const playlists = limitPlaylists ? filtered.slice(0, limitPlaylists) : filtered;
  console.log(`Processing ${playlists.length} playlists for game generation.\n`);

  const publicDataDir = path.resolve(process.cwd(), 'public', 'data');
  const playlistsOutDir = path.join(publicDataDir, 'playlists');
  fs.mkdirSync(playlistsOutDir, { recursive: true });

  const manifestPlaylists: Manifest['playlists'] = [];
  let totalTracksSeen = 0;
  let resolvedFromCacheCount = 0;
  let resolvedFreshCount = 0;
  let unmatchedCount = 0;

  for (let pIdx = 0; pIdx < playlists.length; pIdx++) {
    const pl = playlists[pIdx]!;
    const outPath = path.join(playlistsOutDir, `${pl.id}.json`);

    // Resume support: if RESUME=true and playlist is already built, reuse it
    if (process.env.RESUME === 'true' && fs.existsSync(outPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as PlaylistFile;
        if (existing.songs && existing.songs.length > 0) {
          manifestPlaylists.push({
            id: pl.id,
            name: pl.name,
            songCount: existing.songs.length,
            file: `playlists/${pl.id}.json`,
          });
          console.log(`[${pIdx + 1}/${playlists.length}] Reusing built playlist: "${pl.name}" (${existing.songs.length} songs).\n`);
          continue;
        }
      } catch {}
    }

    console.log(`[${pIdx + 1}/${playlists.length}] Processing playlist: "${pl.name}" (${pl.totalTracks} reported tracks)...`);

    const rawTracks = await fetchPlaylistTracks(pl.id);
    totalTracksSeen += rawTracks.length;

    const playableSongs: Song[] = [];

    for (const track of rawTracks) {
      const override = overrides[track.id];

      // Manual skip in overrides
      if (override?.skip) {
        continue;
      }

      // 1. Manual preview & artwork in overrides
      if (override?.previewUrl) {
        playableSongs.push({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          previewUrl: override.previewUrl,
          artworkUrl: override.artworkUrl || track.spotifyArtworkUrl,
        });
        continue;
      }

      // 2. Cache lookup
      const cached = cache[track.id];
      if (isCacheValid(cached)) {
        if (cached && !cached.failed && cached.previewUrl) {
          resolvedFromCacheCount++;
          const canonicalArtwork = override?.artworkUrl || track.spotifyArtworkUrl || cached.artworkUrl || '';
          if (track.spotifyArtworkUrl && cached.artworkUrl !== track.spotifyArtworkUrl) {
            cached.artworkUrl = track.spotifyArtworkUrl;
          }
          playableSongs.push({
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            previewUrl: cached.previewUrl,
            artworkUrl: canonicalArtwork,
          });
          continue;
        } else if (cached?.failed) {
          // Recently failed, skip trying again
          unmatchedCount++;
          unmatchedReport.push({
            playlist: pl.name,
            playlistId: pl.id,
            trackId: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            reason: cached.failureReason || 'Previously failed resolution',
          });
          continue;
        }
      }

      // 3. Check Cloudflare R2 for studio intro audio
      process.stdout.write(`  Checking R2: "${track.title}" by ${track.artist}... `);
      const inR2 = await audioExistsInR2(track.id);

      if (inR2) {
        resolvedFreshCount++;
        const r2Url = getR2PublicUrl(track.id);
        process.stdout.write(`[OK: r2]\n`);

        const canonicalArtwork = override?.artworkUrl || track.spotifyArtworkUrl;
        const newCacheEntry: CacheEntry = {
          previewUrl: r2Url,
          artworkUrl: canonicalArtwork,
          source: 'r2',
          previewType: 'intro',
          resolvedAt: new Date().toISOString(),
        };
        cache[track.id] = newCacheEntry;

        playableSongs.push({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          previewUrl: r2Url,
          artworkUrl: canonicalArtwork,
        });
      } else {
        unmatchedCount++;
        process.stdout.write(`[PENDING INTRO INGESTION]\n`);

        cache[track.id] = {
          failed: true,
          failureReason: 'Needs intro audio ingestion to R2 (run npm run data:ingest)',
          resolvedAt: new Date().toISOString(),
        };

        unmatchedReport.push({
          playlist: pl.name,
          playlistId: pl.id,
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          reason: 'Needs intro audio ingestion to R2 (run npm run data:ingest)',
        });
      }
    }

    // Deduplicate songs within this playlist
    const dedupedSongs = deduplicateSongs(playableSongs);

    if (dedupedSongs.length > 0) {
      const playlistFile: PlaylistFile = {
        id: pl.id,
        name: pl.name,
        generatedAt: new Date().toISOString(),
        songs: dedupedSongs,
      };

      const outPath = path.join(playlistsOutDir, `${pl.id}.json`);
      fs.writeFileSync(outPath, JSON.stringify(playlistFile, null, 2) + '\n', 'utf-8');

      manifestPlaylists.push({
        id: pl.id,
        name: pl.name,
        songCount: dedupedSongs.length,
        file: `playlists/${pl.id}.json`,
      });

      console.log(`  -> Saved ${dedupedSongs.length} playable songs to playlists/${pl.id}.json`);
      // Incremental cache save
      saveCache(cache);

      // Incremental manifest update
      const currentManifest: Manifest = {
        generatedAt: new Date().toISOString(),
        playlists: sortPlaylists(manifestPlaylists),
      };
      fs.writeFileSync(path.join(publicDataDir, 'manifest.json'), JSON.stringify(currentManifest, null, 2) + '\n', 'utf-8');
    } else {
      console.log(`  -> 0 playable songs. Omitted from manifest.`);
      saveCache(cache);
    }
  }

  // Write Manifest
  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    playlists: sortPlaylists(manifestPlaylists),
  };

  fs.writeFileSync(path.join(publicDataDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  // Save Cache
  saveCache(cache);

  // Write unmatched report
  const dataDir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'unmatched.json'), JSON.stringify(unmatchedReport, null, 2) + '\n', 'utf-8');

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=========================================');
  console.log('⚡ DATA PIPELINE SUMMARY');
  console.log('=========================================');
  console.log(`Playlists processed:       ${playlists.length}`);
  console.log(`Playlists with songs:      ${manifest.playlists.length}`);
  console.log(`Total tracks seen:         ${totalTracksSeen}`);
  console.log(`Resolved from cache:       ${resolvedFromCacheCount}`);
  console.log(`Resolved fresh:            ${resolvedFreshCount}`);
  console.log(`Unmatched tracks:          ${unmatchedCount}`);
  console.log(`Duration:                  ${durationSec}s`);
  console.log(`Outputs:                   public/data/manifest.json`);
  console.log(`                           public/data/playlists/*.json`);
  console.log(`                           data/unmatched.json`);
  console.log('=========================================\n');
}

runDataPipeline().catch((err) => {
  console.error('\n❌ Data pipeline failed:', err);
  process.exit(1);
});
