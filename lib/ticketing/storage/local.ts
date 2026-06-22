import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { dirname, join } from 'path';
import type { StorageProvider, StoredFile } from '@/lib/ticketing/storage/types';

const ROOT = process.env.TICKETING_LOCAL_STORAGE_PATH?.trim() || join(process.cwd(), '.data', 'ticketing-attachments');

function resolvePath(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.includes('..')) {
    throw new Error('Invalid storage key');
  }
  const full = join(ROOT, normalized);
  const rootResolved = join(ROOT);
  if (!full.startsWith(rootResolved)) {
    throw new Error('Path traversal blocked');
  }
  return full;
}

export function createLocalStorageProvider(): StorageProvider {
  return {
    name: 'local',
    async put(key, buffer, _mimeType) {
      const path = resolvePath(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer);
    },
    async get(key) {
      try {
        const path = resolvePath(key);
        const buffer = await readFile(path);
        return { storageKey: key, buffer, mimeType: '', sizeBytes: buffer.length };
      } catch {
        return null;
      }
    },
    async delete(key) {
      try {
        await unlink(resolvePath(key));
      } catch {
        /* ignore missing */
      }
    },
  };
}

export type { StoredFile };
