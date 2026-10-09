import fs from 'node:fs';
import path from 'node:path';
import { fetchUserPlaylists, getCurrentUser } from './spotify';

interface TrackedPlaylist {
  id: string;
  name: string;
}

async function syncPlaylists() {
  console.log('🔄 Checking Spotify playlists status...\n');

  const user = await getCurrentUser();
  console.log(`Authenticated as: ${user.display_name} (@${user.id})`);

  const allOwned = await fetchUserPlaylists();
  console.log(`Found ${allOwned.length} owned playlists on Spotify account.\n`);

  const playlistsJsonPath = path.resolve(process.cwd(), 'data', 'playlists.json');
  let currentTracked: TrackedPlaylist[] = [];

  if (fs.existsSync(playlistsJsonPath)) {
    try {
      currentTracked = JSON.parse(fs.readFileSync(playlistsJsonPath, 'utf-8'));
    } catch {}
  }

  const trackedIds = new Set(currentTracked.map((p) => p.id));

  console.log('=== Currently Configured Playlists in Speed Song ===');
  currentTracked.forEach((p, idx) => {
    const live = allOwned.find((o) => o.id === p.id);
    const count = live ? `${live.totalTracks} tracks` : 'not found';
    console.log(`  ${idx + 1}. [ACTIVE] "${p.name}" (${count}) [id: ${p.id}]`);
  });

  const unconfigured = allOwned.filter((p) => !trackedIds.has(p.id));
  if (unconfigured.length > 0) {
    console.log('\n=== Other Available Playlists (Not currently included) ===');
    unconfigured.forEach((p) => {
      console.log(`  - "${p.name}" (${p.totalTracks} tracks) [id: ${p.id}]`);
    });
    console.log(
      '\n💡 To add any of these to Speed Song, add its ID and name to data/playlists.json.'
    );
  }

  console.log('\nDone.');
}

syncPlaylists().catch((err) => {
  console.error('Error syncing playlists:', err);
  process.exit(1);
});
