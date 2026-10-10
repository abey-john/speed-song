import { execSync } from 'node:child_process';
import { runIngestion } from './ingest-intro';

async function main() {
  console.log('=====================================================');
  console.log('🔄 SPEED SONG — FULL SYNC & INTRO INGESTION');
  console.log('=====================================================\n');

  // Step 1: Sync from Spotify API
  console.log('Step 1/2: Syncing tracklists from Spotify API...');
  try {
    execSync('npm run data:build', { stdio: 'inherit', env: process.env });
  } catch (err) {
    console.warn('⚠️ Spotify data build encountered an issue; proceeding to intro ingestion...');
  }

  // Step 2: Ingest 30s studio intros to Cloudflare R2
  console.log('\nStep 2/2: Ingesting intro clips across all playlists to Cloudflare R2...');
  const includeCompendium = process.argv.includes('--include-compendium');
  const concurrencyArg = process.argv.find((_, i) => (process.argv[i - 1] === '--concurrency' || process.argv[i - 1] === '-c'));
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 5;

  await runIngestion({
    all: true,
    includeCompendium,
    concurrency,
  });

  console.log('=====================================================');
  console.log('🎉 SYNC & INGESTION COMPLETE! Ready to test or commit.');
  console.log('=====================================================\n');
}

main().catch((err) => {
  console.error('Fatal error during update:', err);
  process.exit(1);
});
