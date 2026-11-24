import { createPostgresStorageProvider } from '@/lib/ticketing/storage/postgres';
import { createLocalStorageProvider } from '@/lib/ticketing/storage/local';
import { createS3StorageProvider } from '@/lib/ticketing/storage/s3';
import type { StorageProvider } from '@/lib/ticketing/storage/types';

let provider: StorageProvider | null = null;

function withDisabledR2Fallback(s3: StorageProvider): StorageProvider {
  const fallback = createPostgresStorageProvider();
  let r2Disabled = false;
  return {
    ...s3,
    async put(key, buffer, mimeType) {
      if (!r2Disabled) {
        try {
          await s3.put(key, buffer, mimeType);
          return;
        } catch (error) {
          if (!(error instanceof Error) || !/enable R2 through the Cloudflare Dashboard/i.test(error.message)) {
            throw error;
          }
          r2Disabled = true;
        }
      }
      await fallback.put(key, buffer, mimeType);
    },
    async get(key) {
      try {
        return await fallback.get(key);
      } catch {
        return s3.get(key);
      }
    },
    async delete(key) {
      const [primary, secondary] = await Promise.allSettled([s3.delete(key), fallback.delete(key)]);
      if (primary.status === 'rejected' && secondary.status === 'rejected') throw secondary.reason;
    },
  };
}

export function getTicketingStorage(): StorageProvider {
  if (provider) return provider;
  const mode = (process.env.TICKETING_STORAGE_PROVIDER || 'local').toLowerCase();
  if (mode === 's3') {
    const s3 = createS3StorageProvider();
    provider = process.env.POSTGRES_URL?.trim() ? withDisabledR2Fallback(s3) : s3;
  } else {
    provider = mode === 'postgres' ? createPostgresStorageProvider() : createLocalStorageProvider();
  }
  return provider;
}

export function resetTicketingStorageForTests(): void {
  provider = null;
}
