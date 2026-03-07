import { vi } from 'vitest';

export const Camera = {
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

export interface Photo {
  base64String?: string;
  dataUrl?: string;
  path?: string;
  webPath?: string;
  exif?: Record<string, unknown>;
  format: string;
  saved: boolean;
}
