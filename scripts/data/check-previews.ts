import fs from 'node:fs';
import path from 'node:path';
import { Manifest, PlaylistFile } from '../../src/data/types';

async function checkPreviews() {
  console.log('🔍 Checking resolved audio previews and artwork URLs...\n');

  const manifestPath = path.resolve(process.cwd(), 'public', 'data', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ public/data/manifest.json does not exist. Run npm run data:build first.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest;
  let totalChecked = 0;
  let failedPreviews = 0;
  let failedArtwork = 0;

  const limitCheck = process.env.LIMIT_CHECK ? parseInt(process.env.LIMIT_CHECK, 10) : undefined;
  const targetPlaylistId = process.env.PLAYLIST_ID;

  for (const plEntry of manifest.playlists) {
    if (targetPlaylistId && plEntry.id !== targetPlaylistId) continue;

    const plPath = path.resolve(process.cwd(), 'public', 'data', plEntry.file);
    if (!fs.existsSync(plPath)) {
      console.warn(`⚠️ Missing playlist file: ${plPath}`);
      continue;
    }

    const playlist = JSON.parse(fs.readFileSync(plPath, 'utf-8')) as PlaylistFile;
    console.log(`Checking playlist: "${playlist.name}" (${playlist.songs.length} songs)...`);

    for (const song of playlist.songs) {
      if (limitCheck && totalChecked >= limitCheck) break;
      totalChecked++;

      // Check previewUrl (HEAD or range GET)
      try {
        const res = await fetch(song.previewUrl, { method: 'HEAD' });
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok) {
          console.error(`  ❌ Preview HTTP ${res.status}: "${song.title} — ${song.artist}" (${song.previewUrl})`);
          failedPreviews++;
        } else if (!contentType.includes('audio') && !contentType.includes('mp4') && !contentType.includes('m4a') && !contentType.includes('octet-stream')) {
          console.warn(`  ⚠️ Unexpected preview content-type "${contentType}": "${song.title}"`);
        }
      } catch (err) {
        console.error(`  ❌ Preview network error: "${song.title}"`, err);
        failedPreviews++;
      }

      // Check artworkUrl
      if (song.artworkUrl) {
        try {
          const res = await fetch(song.artworkUrl, { method: 'HEAD' });
          if (!res.ok) {
            console.error(`  ❌ Artwork HTTP ${res.status}: "${song.title} — ${song.artist}" (${song.artworkUrl})`);
            failedArtwork++;
          }
        } catch (err) {
          console.error(`  ❌ Artwork network error: "${song.title}"`, err);
          failedArtwork++;
        }
      }
    }
  }

  console.log('\n=========================================');
  console.log('🔍 PREVIEW CHECK RESULTS');
  console.log('=========================================');
  console.log(`Total songs checked:   ${totalChecked}`);
  console.log(`Failed previews:       ${failedPreviews}`);
  console.log(`Failed artworks:       ${failedArtwork}`);
  console.log('=========================================\n');

  if (failedPreviews > 0) {
    console.warn('⚠️ Some preview URLs failed validation.');
  } else {
    console.log('✅ All checked preview URLs are valid and reachable!');
  }
}

checkPreviews().catch((err) => {
  console.error('❌ Check previews failed:', err);
  process.exit(1);
});
