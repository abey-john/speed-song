import { isR2Configured, listR2Objects } from './r2';

async function main() {
  if (!isR2Configured()) {
    console.error('Error: Cloudflare R2 is not configured in .env');
    process.exit(1);
  }

  const bucket = process.env.R2_BUCKET_NAME;
  console.log(`Querying Cloudflare R2 bucket: "${bucket}"...`);

  const objects = await listR2Objects();
  const totalBytes = objects.reduce((sum, obj) => sum + obj.size, 0);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

  console.log(`\nBucket summary for "${bucket}":`);
  console.log(`- Total objects: ${objects.length}`);
  console.log(`- Total storage: ${totalMB} MB (${totalBytes.toLocaleString()} bytes)`);

  if (process.argv.includes('--list')) {
    console.log('\nObjects in bucket:');
    for (const obj of objects) {
      console.log(` - ${obj.key} (${Math.round(obj.size / 1024)} KB)`);
    }
  }
}

main().catch((err) => {
  console.error('Failed to query R2 bucket:', err);
  process.exit(1);
});
