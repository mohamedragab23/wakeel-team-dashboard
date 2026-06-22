export type StoredFile = {
  storageKey: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
};

export type StorageProvider = {
  readonly name: string;
  put(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
};
