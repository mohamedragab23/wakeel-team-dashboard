import { deletePrivateObject, getPrivateObject, putPrivateObject } from '@/lib/privateObjectStore';
import { createS3StorageProvider } from '@/lib/ticketing/storage/s3';
import type { StorageProvider } from '@/lib/ticketing/storage/types';

export function createPostgresStorageProvider(): StorageProvider {
  return {
    name: 'postgres',
    async put(key, buffer, mimeType) { await putPrivateObject(`attachments/${key}`, buffer, mimeType); },
    async get(key) {
      const result = await getPrivateObject(`attachments/${key}`);
      if (result) return { ...result, storageKey: key };
      // Preserve access to pre-migration files if the old R2 service becomes available.
      try { return await createS3StorageProvider().get(key); } catch { return null; }
    },
    async delete(key) { await deletePrivateObject(`attachments/${key}`); },
  };
}
