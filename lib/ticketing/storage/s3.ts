import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageProvider, StoredFile } from '@/lib/ticketing/storage/types';

function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required for S3 ticketing storage`);
  return v;
}

export function createS3StorageProvider(): StorageProvider {
  const bucket = requiredEnv('TICKETING_S3_BUCKET');
  const region = process.env.TICKETING_S3_REGION?.trim() || 'auto';
  const endpoint = process.env.TICKETING_S3_ENDPOINT?.trim();
  const prefix = (process.env.TICKETING_S3_PREFIX?.trim() || 'ticketing').replace(/\/$/, '');

  const client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: requiredEnv('TICKETING_S3_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('TICKETING_S3_SECRET_ACCESS_KEY'),
    },
  });

  const fullKey = (key: string) => `${prefix}/${key.replace(/^\/+/, '')}`;

  return {
    name: 's3',
    async put(key, buffer, mimeType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: fullKey(key),
          Body: buffer,
          ContentType: mimeType,
        })
      );
    },
    async get(key) {
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: fullKey(key) })
        );
        const bytes = await res.Body?.transformToByteArray();
        if (!bytes) return null;
        const buffer = Buffer.from(bytes);
        return {
          storageKey: key,
          buffer,
          mimeType: res.ContentType || 'application/octet-stream',
          sizeBytes: buffer.length,
        };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fullKey(key) }));
    },
  };
}

export type { StoredFile };
