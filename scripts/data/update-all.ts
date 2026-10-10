import { execSync } from 'node:child_process';
import { runIngestion } from './ingest-intro';

async function main() {
  console.log('=====================================================');
  console.log('🔄 SPEED SONG — FULL SYNC & INTRO INGESTION');
  console.log('=====================================================\n');

  const includeCompendium = process.argv.includes('--include-compendium') || process.argv.includes('-c-all');
  const concurrencyArg = process.argv.find((_, i) => (process.argv[i - 1] === '--concurrency' || process.argv[i - 1] === '-c'));
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 4;

  let cookiesBrowser: string | null = null;
  let playerClient: string | null = 'android';

  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--unauthenticated' || arg === '--unauth' || arg === '--default') {
      playerClient = null;
      cookiesBrowser = null;
    } else if (arg === '--android') {
      playerClient = 'android';
      cookiesBrowser = null;
    } else if (arg === '--cookies') {
      const next = process.argv[i + 1];
      if (next && !next.startsWith('--')) {
        cookiesBrowser = next;
        i++;
      } else {
        cookiesBrowser = 'firefox';
      }
      playerClient = null;
    }
  }

  // Step 1: Ingest missing 30s studio intros to Cloudflare R2
  console.log('Step 1/2: Checking Spotify tracks & ingesting missing intros to R2...');
  await runIngestion({
    all: true,
    includeCompendium,
    concurrency,
    cookiesBrowser,
    playerClient,
  });

  // Step 2: Build final static JSON playlists & manifest
  console.log('\nStep 2/2: Building game playlist JSON files and manifest...');
  try {
    execSync('npm run data:build', { stdio: 'inherit', env: process.env });
  } catch (err) {
    console.warn('⚠️ data:build encountered an issue:', err);
  }

  console.log('\n=====================================================');
  console.log('🎉 SYNC & INGESTION COMPLETE! Ready to commit or push.');
  console.log('=====================================================\n');
}

main().catch((err) => {
  console.error('Fatal error during update:', err);
  process.exit(1);
});
