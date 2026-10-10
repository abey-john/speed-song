import fs from 'node:fs';
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

let s3ClientInstance: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('Missing Cloudflare R2 credentials in environment variables.');
    }

    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return s3ClientInstance;
}

export function getR2PublicUrl(trackId: string): string {
  const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
  return `${publicBase}/${trackId}.m4a`;
}

/**
 * Checks if the track audio file already exists in the R2 bucket.
 */
export async function audioExistsInR2(trackId: string): Promise<boolean> {
  if (!isR2Configured()) return false;

  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME!;

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: `${trackId}.m4a`,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Uploads a local .m4a file to Cloudflare R2 and returns its public URL.
 */
export async function uploadAudioToR2(trackId: string, localFilePath: string): Promise<string> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME;

  if (!bucket) {
    throw new Error('R2_BUCKET_NAME is not set in environment.');
  }

  const fileBuffer = fs.readFileSync(localFilePath);
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${trackId}.m4a`,
          Body: fileBuffer,
          ContentType: 'audio/mp4',
          ContentLength: fileBuffer.length,
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
      return getR2PublicUrl(trackId);
    } catch (err: unknown) {
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1500 + Math.random() * 500;
        console.warn(`\n⚠️ R2 upload transient error for ${trackId}. Retrying in ${(delay / 1000).toFixed(1)}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  return getR2PublicUrl(trackId);
}

/**
 * Lists all objects in the configured Cloudflare R2 bucket.
 */
export async function listR2Objects(): Promise<{ key: string; size: number; lastModified?: Date }[]> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME;

  if (!bucket) {
    throw new Error('R2_BUCKET_NAME is not set in environment.');
  }

  const objects: { key: string; size: number; lastModified?: Date }[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      })
    );

    if (res.Contents) {
      for (const item of res.Contents) {
        if (item.Key) {
          objects.push({
            key: item.Key,
            size: item.Size ?? 0,
            lastModified: item.LastModified,
          });
        }
      }
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  return objects;
}
