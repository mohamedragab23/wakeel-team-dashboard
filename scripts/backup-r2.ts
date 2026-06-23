/**
 * Read-only Cloudflare R2 inventory (ListObjects). No uploads or deletes.
 */
import { config } from 'dotenv';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

async function main() {
  const bucket = process.env.TICKETING_S3_BUCKET?.trim();
  const endpoint = process.env.TICKETING_S3_ENDPOINT?.trim();
  const accessKeyId = process.env.TICKETING_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.TICKETING_S3_SECRET_ACCESS_KEY?.trim();
  const prefix = (process.env.TICKETING_S3_PREFIX?.trim() || 'ticketing').replace(/\/$/, '');

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    console.log(
      JSON.stringify({
        success: false,
        readOnly: true,
        error: 'R2/S3 env not configured (TICKETING_S3_*)',
      })
    );
    process.exit(1);
  }

  const client = new S3Client({
    region: process.env.TICKETING_S3_REGION?.trim() || 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  const objects: Array<{ key: string; size: number; lastModified?: string }> = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/`, ContinuationToken: token })
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) {
        objects.push({
          key: o.Key,
          size: o.Size ?? 0,
          lastModified: o.LastModified?.toISOString(),
        });
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(process.cwd(), 'exports', `r2-inventory-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    exportedAt: new Date().toISOString(),
    readOnly: true,
    bucket,
    prefix,
    objectCount: objects.length,
    totalBytes: objects.reduce((s, o) => s + o.size, 0),
    objects,
  };

  fs.writeFileSync(path.join(outDir, 'inventory.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify({ success: true, outDir, objectCount: objects.length, readOnly: true }, null, 2));
}

main().catch((e) => {
  console.error('[backup-r2] failed:', e);
  process.exit(1);
});
