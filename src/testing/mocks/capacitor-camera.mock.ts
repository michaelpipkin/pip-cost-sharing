import { vi } from 'vitest';

export const Camera = {
  // Current API used by camera.service.ts
  takePhoto: vi
    .fn()
    .mockResolvedValue({ webPath: undefined, metadata: undefined }),
  chooseFromGallery: vi.fn().mockResolvedValue({ results: [] }),
  // Deprecated API, kept for completeness / any remaining callers
  getPhoto: vi
    .fn()
    .mockResolvedValue({ webPath: undefined, format: undefined }),
  pickImages: vi.fn().mockResolvedValue({ photos: [] }),
};

export enum CameraSource {
  Camera = 'CAMERA',
  Photos = 'PHOTOS',
  Prompt = 'PROMPT',
}

export enum CameraResultType {
  Uri = 'uri',
  Base64 = 'base64',
  DataUrl = 'dataUrl',
}

export enum MediaType {
  Photo = 0,
  Video = 1,
}

export interface MediaMetadata {
  size?: number;
  duration?: number;
  format: string;
  resolution?: string;
  creationDate?: string;
  exif?: string;
}

export interface MediaResult {
  type: MediaType;
  uri?: string;
  thumbnail?: string;
  saved: boolean;
  webPath?: string;
  metadata?: MediaMetadata;
}

export interface Photo {
  base64String?: string;
  dataUrl?: string;
  path?: string;
  webPath?: string;
  exif?: Record<string, unknown>;
  format: string;
  saved: boolean;
}
