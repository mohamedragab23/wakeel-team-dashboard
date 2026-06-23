import { ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export type BackupS3Config = {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

export function getBackupS3Config(): BackupS3Config | null {
  const bucket = process.env.TICKETING_S3_BUCKET?.trim();
  const endpoint = process.env.TICKETING_S3_ENDPOINT?.trim();
  const accessKeyId = process.env.TICKETING_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.TICKETING_S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    region: process.env.TICKETING_S3_REGION?.trim() || 'auto',
  };
}

function createClient(cfg: BackupS3Config): S3Client {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

/** Upload backup artifact under `backups/daily/` — does not modify ticketing objects. */
export async function putDailyBackupObject(
  stamp: string,
  relativeKey: string,
  body: string | Buffer,
  contentType = 'application/json'
): Promise<string> {
  const cfg = getBackupS3Config();
  if (!cfg) throw new Error('R2/S3 not configured for backup archive');

  const key = `backups/daily/${stamp}/${relativeKey.replace(/^\/+/, '')}`;
  const client = createClient(cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

export async function listTicketingObjects(): Promise<
  Array<{ key: string; size: number; lastModified?: string }>
> {
  const cfg = getBackupS3Config();
  if (!cfg) throw new Error('R2/S3 not configured');

  const prefix = (process.env.TICKETING_S3_PREFIX?.trim() || 'ticketing').replace(/\/$/, '');
  const client = createClient(cfg);
  const objects: Array<{ key: string; size: number; lastModified?: string }> = [];
  let token: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: `${prefix}/`,
        ContinuationToken: token,
      })
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

  return objects;
}
