import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { loadCache, saveCache } from './cache';
import { loadOverrides } from './overrides';
import { searchYouTubeMusicSong } from './ytmusic';
import { isR2Configured, uploadAudioToR2, audioExistsInR2, getR2PublicUrl } from './r2';
import { fetchPlaylistTracks } from './spotify';
import { PlaylistFile, Song } from '../../src/data/types';
import { CacheEntry } from './types';

interface IngestOptions {
  playlistQuery?: string;
  all?: boolean;
  includeCompendium?: boolean;
  limit?: number;
  force?: boolean;
  silenceTrim?: boolean;
  concurrency?: number;
  trackQuery?: string;
  cookiesBrowser?: string | null;
  playerClient?: string | null;
}

/**
 * Resolves the path to yt-dlp and ffmpeg executables across platforms,
 * with Windows WinGet fallback for newly installed packages.
 */
function findExecutable(binName: 'yt-dlp' | 'ffmpeg'): string {
  // 1. Check current system PATH
  const isWin = process.platform === 'win32';
  const exeName = isWin ? `${binName}.exe` : binName;

  try {
    const checkCmd = isWin ? 'where' : 'which';
    const result = execFileSync(checkCmd, [exeName], { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' });
    const firstLine = result.trim().split(/\r?\n/)[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
    // Not found in active PATH
  }

  // 2. Windows WinGet package directories fallback
  if (isWin && process.env.LOCALAPPDATA) {
    const wingetPackagesDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPackagesDir)) {
      try {
        const entries = fs.readdirSync(wingetPackagesDir, { recursive: true }) as string[];
        for (const rel of entries) {
          if (path.basename(rel).toLowerCase() === exeName.toLowerCase()) {
            const fullPath = path.join(wingetPackagesDir, rel);
            if (fs.existsSync(fullPath)) {
              return fullPath;
            }
          }
        }
      } catch {
        // Fallback scan error ignored
      }
    }
  }

  throw new Error(
    `Required binary "${binName}" was not found. Please ensure it is installed and added to PATH.`
  );
}

/**
 * Cleans track and artist string for high-precision YouTube Topic search.
 */
export function buildSearchQueries(title: string, artist: string): string[] {
  // Clean features/remaster suffixes and unescaped quotes
  const cleanTitle = title
    .replace(/\s*-\s*Remaster(ed)?(\s*\d{4})?/i, '')
    .replace(/\s*\(Remaster(ed)?(\s*\d{4})?\)/i, '')
    .replace(/["']/g, '')
    .trim();

  const cleanArtist = artist.replace(/["']/g, '').trim();

  // Primary: YouTube Topic release
  const primary = `ytsearch5:${cleanArtist} ${cleanTitle} Topic`;
  // Secondary fallback: general official audio
  const fallback = `ytsearch5:${cleanArtist} ${cleanTitle} audio`;

  return [primary, fallback];
}

/**
 * Downloads and slices 0:00 to 0:30 of the track asynchronously via yt-dlp & ffmpeg.
 */
export function downloadIntroSnippetAsync(
  ytDlpPath: string,
  ffmpegPath: string,
  query: string,
  outputPath: string,
  options?: { silenceTrim?: boolean; cookiesBrowser?: string | null; playerClient?: string | null }
): Promise<{ success: boolean; throttled: boolean; error?: string }> {
  return new Promise((resolve) => {
    const ffmpegDir = path.dirname(ffmpegPath);
    const outDir = path.dirname(outputPath);
    const ext = path.extname(outputPath).slice(1) || 'm4a';
    const outBase = path.basename(outputPath, `.${ext}`);
    const template = path.join(outDir, `${outBase}.%(ext)s`);

    let ffmpegArgs = '-ss 00:00:00 -t 30';
    if (options?.silenceTrim) {
      ffmpegArgs += ' -af silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB';
    }

    const isDirectUrl = query.startsWith('http://') || query.startsWith('https://');
    const playerClient = options?.playerClient === undefined ? 'android' : options.playerClient;
    const cookiesBrowser = options?.cookiesBrowser || null;

    const args = [
      '-x',
      '--audio-format',
      ext,
      '--audio-quality',
      '96k',
      '--ffmpeg-location',
      ffmpegDir,
      '--js-runtimes',
      'node',
      ...(playerClient ? ['--extractor-args', `youtube:player_client=${playerClient}`] : []),
      ...(cookiesBrowser && !playerClient ? ['--cookies-from-browser', cookiesBrowser] : []),
      '--postprocessor-args',
      `ffmpeg:${ffmpegArgs}`,
      '--no-playlist',
      '--no-warnings',
      '--retries',
      '3',
      ...(isDirectUrl
        ? []
        : [
            '--max-downloads',
            '1',
            '--match-filters',
            "!is_live & title !~= '(?i)official video' & title !~= '(?i)music video' & title !~= '(?i)short film' & title !~= '(?i)reaction' & title !~= '(?i)cover'",
          ]),
      '-o',
      template,
      query,
    ];

    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch {}
    }

    const proc = spawn(ytDlpPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env,
        PATH: `${ffmpegDir};${process.env.PATH || ''}`,
      },
    });

    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', () => {
      const throttled = /429|Too Many Requests|confirm you're not a bot|rate limit|Sign in to confirm/i.test(stderr);
      const success = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 50000;
      resolve({ success, throttled, error: stderr });
    });

    proc.on('error', (err) => {
      resolve({ success: false, throttled: false, error: err.message });
    });
  });
}

/**
 * Downloads with automatic exponential backoff on rate-limiting and Android fallback on unplayable videos.
 */
async function downloadWithBackoff(
  ytDlpPath: string,
  ffmpegPath: string,
  queries: string[],
  destFile: string,
  options?: { silenceTrim?: boolean; songTitle?: string; cookiesBrowser?: string | null; playerClient?: string | null }
): Promise<boolean> {
  const maxRetries = 3;

  for (const query of queries) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await downloadIntroSnippetAsync(ytDlpPath, ffmpegPath, query, destFile, {
        silenceTrim: options?.silenceTrim,
        cookiesBrowser: options?.cookiesBrowser,
        playerClient: options?.playerClient,
      });

      if (result.success) {
        return true;
      }

      // If YouTube web says "Video unavailable" due to PO-token desktop blocks and android client isn't disabled, try Android client
      if (!result.success && result.error && /Video unavailable/i.test(result.error) && options?.playerClient !== null) {
        const androidResult = await downloadIntroSnippetAsync(ytDlpPath, ffmpegPath, query, destFile, {
          silenceTrim: options?.silenceTrim,
          cookiesBrowser: null,
          playerClient: 'android',
        });
        if (androidResult.success) {
          return true;
        }
      }

      if (result.throttled) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 3000 + Math.random() * 1000;
          console.warn(
            `\n⚠️ [${options?.songTitle ?? 'Track'}] Throttled by YouTube (429/bot-check). Backing off for ${(delay / 1000).toFixed(1)}s (retry ${attempt + 1}/${maxRetries})...`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      break;
    }
  }

  return false;
}

/**
 * Downloads and slices 0:00 to 0:30 of the track via yt-dlp & ffmpeg.
 */
export function downloadIntroSnippet(
  ytDlpPath: string,
  ffmpegPath: string,
  query: string,
  outputPath: string,
  options?: { silenceTrim?: boolean; cookiesBrowser?: string | null }
): boolean {
  const ffmpegDir = path.dirname(ffmpegPath);
  const outDir = path.dirname(outputPath);
  const ext = path.extname(outputPath).slice(1) || 'm4a';
  const outBase = path.basename(outputPath, `.${ext}`);
  const template = path.join(outDir, `${outBase}.%(ext)s`);

  let ffmpegArgs = '-ss 00:00:00 -t 30';
  if (options?.silenceTrim) {
    ffmpegArgs += ' -af silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB';
  }

  const isDirectUrl = query.startsWith('http://') || query.startsWith('https://');
  const cookiesBrowser = options?.cookiesBrowser === undefined ? 'firefox' : options.cookiesBrowser;

  const args = [
    '-x',
    '--audio-format',
    ext,
    '--audio-quality',
    '96k',
    '--ffmpeg-location',
    ffmpegDir,
    '--js-runtimes',
    'node',
    ...(cookiesBrowser ? ['--cookies-from-browser', cookiesBrowser] : []),
    '--postprocessor-args',
    `ffmpeg:${ffmpegArgs}`,
    '--no-playlist',
    '--no-warnings',
    '--retries',
    '3',
    ...(isDirectUrl
      ? []
      : [
          '--max-downloads',
          '1',
          '--match-filters',
          "!is_live & title !~= '(?i)official video' & title !~= '(?i)music video' & title !~= '(?i)short film' & title !~= '(?i)reaction' & title !~= '(?i)cover'",
        ]),
    '-o',
    template,
    query,
  ];

  if (fs.existsSync(outputPath)) {
    try {
      fs.unlinkSync(outputPath);
    } catch {}
  }

  spawnSync(ytDlpPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${ffmpegDir};${process.env.PATH || ''}`,
    },
  });

  return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 50000;
}

export async function runIngestion(options: IngestOptions) {
  console.log('⚡ Starting Song Intro Snippets Ingestion Pipeline...\n');

  const ytDlpPath = findExecutable('yt-dlp');
  const ffmpegPath = findExecutable('ffmpeg');
  console.log(`✓ yt-dlp binary: ${ytDlpPath}`);
  console.log(`✓ ffmpeg binary: ${ffmpegPath}`);

  const r2Enabled = isR2Configured();
  if (r2Enabled) {
    console.log(`✓ Cloudflare R2 configured (Bucket: ${process.env.R2_BUCKET_NAME})`);
  } else {
    console.log('ℹ Cloudflare R2 not configured in .env (staging locally in scripts/data/.temp-audio)');
  }

  const concurrency = Math.max(1, options.concurrency ?? 4);
  console.log(`✓ Concurrency: ${concurrency} parallel workers`);

  if (options.playerClient) {
    console.log(`✓ Auth Mode: Mobile Client (${options.playerClient}, zero cookies)`);
  } else if (options.cookiesBrowser) {
    console.log(`✓ Auth Mode: Browser Cookies (${options.cookiesBrowser})`);
  } else {
    console.log(`✓ Auth Mode: Unauthenticated (Default Web Client, zero cookies)`);
  }
  console.log();

  const publicDataDir = path.resolve(process.cwd(), 'public', 'data');
  const audioDir = path.resolve(process.cwd(), 'scripts', 'data', '.temp-audio');
  fs.mkdirSync(audioDir, { recursive: true });

  // 1. Locate target playlist JSON
  const manifestPath = path.join(publicDataDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Manifest not found at public/data/manifest.json. Run npm run data:build first.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
    playlists: { id: string; name: string; songCount: number; file: string }[];
  };

  let targetPlaylists: typeof manifest.playlists = [];
  if (options.all) {
    targetPlaylists = manifest.playlists.filter(
      (p) => options.includeCompendium || p.id !== '6auUmzLNqMEfTaaM2vBXju'
    );
    console.log(`Processing all ${targetPlaylists.length} playlists (excluding compendium by default)...\n`);
  } else {
    const query = (options.playlistQuery || 'SOTD').toLowerCase().trim();
    const target = manifest.playlists.find(
      (p) => p.id.toLowerCase() === query || p.name.toLowerCase().trim() === query
    );

    if (!target) {
      console.error(`Playlist "${options.playlistQuery}" not found in manifest. Available playlists:`);
      for (const p of manifest.playlists) {
        console.log(` - ${p.name} (id: ${p.id})`);
      }
      process.exit(1);
    }
    targetPlaylists = [target];
  }

  const cache = loadCache();
  const overrides = loadOverrides();

  let grandTotalProcessed = 0;
  let grandTotalDownloaded = 0;
  let grandTotalSkipped = 0;
  let grandTotalFailed = 0;

  for (const targetMeta of targetPlaylists) {
    const playlistFilePath = path.join(publicDataDir, targetMeta.file);
    if (!fs.existsSync(playlistFilePath)) {
      console.warn(`Playlist file not found, skipping: ${playlistFilePath}`);
      continue;
    }

    const playlist = JSON.parse(fs.readFileSync(playlistFilePath, 'utf-8')) as PlaylistFile;

    // Fetch live tracks from Spotify to catch newly added tracks that need audio
    let liveSongs: Song[] = [];
    if (process.env.SPOTIFY_REFRESH_TOKEN) {
      try {
        const liveTracks = await fetchPlaylistTracks(targetMeta.id);
        liveSongs = liveTracks.map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          previewUrl: '',
          artworkUrl: t.spotifyArtworkUrl,
        }));
      } catch {
        // Fallback to local playlist songs if offline or credentials missing
      }
    }

    const baseSongs = liveSongs.length > 0 ? liveSongs : playlist.songs;
    console.log(`▶ Target Playlist: "${playlist.name}" (${baseSongs.length} songs)`);

    let songsToProcess = options.limit ? baseSongs.slice(0, options.limit) : baseSongs;
    if (options.trackQuery) {
      const q = options.trackQuery.toLowerCase().trim();
      songsToProcess = songsToProcess.filter(
        (s) => s.id.toLowerCase() === q || s.title.toLowerCase().includes(q)
      );
      if (songsToProcess.length === 0) {
        console.log(`  No song matching "${options.trackQuery}" in "${playlist.name}".`);
        continue;
      }
    }

    let completedCount = 0;
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    async function processSong(song: Song) {
      const destFile = path.join(audioDir, `${song.id}.m4a`);
      const r2Url = r2Enabled ? getR2PublicUrl(song.id) : null;
      const relAudioUrl = `audio/${song.id}.m4a`;
      const override = overrides[song.id];

      if (r2Enabled && !options.force) {
        const alreadyInR2 = await audioExistsInR2(song.id);
        if (alreadyInR2) {
          completedCount++;
          skippedCount++;
          console.log(`[${completedCount}/${songsToProcess.length}] ⏩ "${song.title}" - ${song.artist} [EXISTS IN R2]`);
          song.previewUrl = r2Url!;
          cache[song.id] = {
            previewUrl: r2Url!,
            artworkUrl: song.artworkUrl,
            source: 'r2',
            previewType: 'intro',
            resolvedAt: new Date().toISOString(),
          };
          return;
        }
      } else if (fs.existsSync(destFile) && !options.force) {
        completedCount++;
        skippedCount++;
        console.log(`[${completedCount}/${songsToProcess.length}] ⏩ "${song.title}" - ${song.artist} [CACHED ON DISK]`);
        song.previewUrl = relAudioUrl;
        return;
      }

      const queries: string[] = [];
      if (override?.youtubeUrl) {
        queries.push(override.youtubeUrl);
      } else {
        // 1. Prioritize YouTube Music "Songs" search for 100% official label audio
        const ytm = await searchYouTubeMusicSong(song.title, song.artist);
        if (ytm?.videoId) {
          queries.push(`https://www.youtube.com/watch?v=${ytm.videoId}`);
        }
        // 2. Fallbacks
        queries.push(...buildSearchQueries(song.title, song.artist));
      }

      const downloaded = await downloadWithBackoff(ytDlpPath, ffmpegPath, queries, destFile, {
        silenceTrim: options.silenceTrim,
        songTitle: song.title,
        cookiesBrowser: options.cookiesBrowser,
        playerClient: options.playerClient,
      });

      if (downloaded) {
        let finalUrl = relAudioUrl;
        let source: 'r2' | 'intro-local' = 'intro-local';

        if (r2Enabled) {
          try {
            finalUrl = await uploadAudioToR2(song.id, destFile);
            source = 'r2';
            try {
              fs.unlinkSync(destFile);
            } catch {}
          } catch (uploadErr) {
            console.warn(`\n⚠️ Failed to upload to R2 for "${song.title}":`, uploadErr);
          }
        }

        const stats = fs.existsSync(destFile) ? fs.statSync(destFile) : null;
        const kb = stats ? Math.round(stats.size / 1024) : 360;

        completedCount++;
        successCount++;
        console.log(
          `[${completedCount}/${songsToProcess.length}] ✓ "${song.title}" - ${song.artist} [OK: ${source === 'r2' ? 'R2 upload' : `${kb} KB local intro`}]`
        );

        song.previewUrl = finalUrl;

        const cacheEntry: CacheEntry = {
          previewUrl: finalUrl,
          artworkUrl: song.artworkUrl,
          source,
          previewType: 'intro',
          resolvedAt: new Date().toISOString(),
        };
        cache[song.id] = cacheEntry;
      } else {
        completedCount++;
        failedCount++;
        console.warn(`[${completedCount}/${songsToProcess.length}] ❌ "${song.title}" - ${song.artist} [FAILED: kept fallback preview]`);
      }
    }

    let songCursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (songCursor < songsToProcess.length) {
        const idx = songCursor++;
        const song = songsToProcess[idx]!;
        await processSong(song);
      }
    });

    await Promise.all(workers);

    saveCache(cache);

    // Merge any newly ingested songs into playlist.songs
    const existingIds = new Set(playlist.songs.map((s) => s.id));
    for (const song of songsToProcess) {
      if (song.previewUrl && !existingIds.has(song.id)) {
        playlist.songs.push(song);
        existingIds.add(song.id);
      }
    }

    fs.writeFileSync(playlistFilePath, JSON.stringify(playlist, null, 2), 'utf-8');

    grandTotalProcessed += songsToProcess.length;
    grandTotalDownloaded += successCount;
    grandTotalSkipped += skippedCount;
    grandTotalFailed += failedCount;
  }

  console.log('\n--- Overall Ingestion Summary ---');
  console.log(`Playlists processed: ${targetPlaylists.length}`);
  console.log(`Total songs checked: ${grandTotalProcessed}`);
  console.log(`Newly downloaded intros: ${grandTotalDownloaded}`);
  console.log(`Reused existing: ${grandTotalSkipped}`);
  console.log(`Failed / kept fallback: ${grandTotalFailed}\n`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('ingest-intro.ts')) {
  const args = process.argv.slice(2);
  let playlistQuery: string | undefined = 'SOTD';
  let all = false;
  let includeCompendium = false;
  let limit: number | undefined;
  let force = false;
  let silenceTrim = false;
  let concurrency: number | undefined;
  let trackQuery: string | undefined;
  let cookiesBrowser: string | null = null;
  let playerClient: string | null = 'android';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all' || arg === '-a') {
      all = true;
      playlistQuery = undefined;
    } else if (arg === '--include-compendium') {
      includeCompendium = true;
    } else if (arg === '--playlist' && args[i + 1]) {
      playlistQuery = args[++i]!;
      all = false;
    } else if (arg === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i]!, 10);
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--silence-trim') {
      silenceTrim = true;
    } else if ((arg === '--concurrency' || arg === '-c') && args[i + 1]) {
      concurrency = parseInt(args[++i]!, 10);
    } else if ((arg === '--track' || arg === '--song') && args[i + 1]) {
      trackQuery = args[++i]!;
      force = true;
    } else if (arg === '--unauthenticated' || arg === '--unauth' || arg === '--default') {
      playerClient = null;
      cookiesBrowser = null;
    } else if (arg === '--android') {
      playerClient = 'android';
      cookiesBrowser = null;
    } else if (arg === '--ios') {
      playerClient = 'ios';
      cookiesBrowser = null;
    } else if (arg === '--cookies') {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        cookiesBrowser = next;
        i++;
      } else {
        cookiesBrowser = 'firefox';
      }
      playerClient = null;
    } else if (arg === '--no-cookies') {
      cookiesBrowser = null;
    }
  }

  runIngestion({
    playlistQuery,
    all,
    includeCompendium,
    limit,
    force,
    silenceTrim,
    concurrency,
    trackQuery,
    cookiesBrowser,
    playerClient,
  }).catch((err) => {
    console.error('Fatal error during ingestion:', err);
    process.exit(1);
  });
}
