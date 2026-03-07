import { vi } from 'vitest';

export interface StorageReference {
  bucket: string;
  fullPath: string;
  name: string;
}

export const getStorage = vi.fn().mockReturnValue({}) as any;
export const ref = vi.fn().mockReturnValue({}) as any;
export const uploadBytes = vi.fn().mockResolvedValue({ ref: {} }) as any;
export const deleteObject: (ref: StorageReference) => Promise<void> = vi
  .fn()
  .mockResolvedValue(undefined) as any;
export const getDownloadURL = vi
  .fn()
  .mockResolvedValue('https://mock.url/file') as any;
export const connectStorageEmulator = vi.fn() as any;
