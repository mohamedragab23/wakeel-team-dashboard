import { createLocalStorageProvider } from '@/lib/ticketing/storage/local';
import { createS3StorageProvider } from '@/lib/ticketing/storage/s3';
import type { StorageProvider } from '@/lib/ticketing/storage/types';

let provider: StorageProvider | null = null;

export function getTicketingStorage(): StorageProvider {
  if (provider) return provider;
  const mode = (process.env.TICKETING_STORAGE_PROVIDER || 'local').toLowerCase();
  provider = mode === 's3' ? createS3StorageProvider() : createLocalStorageProvider();
  return provider;
}

export function resetTicketingStorageForTests(): void {
  provider = null;
}
