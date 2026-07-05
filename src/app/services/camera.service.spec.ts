import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { CameraService } from './camera.service';

function makeMockBlob(mimeType: string): Blob {
  return new Blob(['fake-image-data'], { type: mimeType });
}

describe('CameraService', () => {
  let service: CameraService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Camera, 'takePhoto').mockResolvedValue({
      webPath: 'test://photo.jpg',
      saved: false,
      metadata: { format: 'jpeg' },
    } as any);
    vi.spyOn(Camera, 'chooseFromGallery').mockResolvedValue({
      results: [],
    } as any);
    service = new CameraService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isAvailable', () => {
    it('should return true on native platforms', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('should return false on non-native platforms', () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
      // Re-create service after changing the spy
      service = new CameraService();
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('takePicture', () => {
    it('should call Camera.takePhoto', async () => {
      const mockBlob = makeMockBlob('image/jpeg');
      vi.spyOn(Camera, 'takePhoto').mockResolvedValueOnce({
        webPath: 'test://photo.jpg',
        saved: false,
        metadata: { format: 'jpeg' },
      } as any);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        blob: async () => mockBlob,
      } as any);

      await service.takePicture();

      expect(Camera.takePhoto).toHaveBeenCalledWith(
        expect.objectContaining({ includeMetadata: true })
      );
    });

    it('should return a File with the correct MIME type from the blob', async () => {
      const mockBlob = makeMockBlob('image/png');
      vi.spyOn(Camera, 'takePhoto').mockResolvedValueOnce({
        webPath: 'test://photo.png',
        saved: false,
        metadata: undefined,
      } as any);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        blob: async () => mockBlob,
      } as any);

      const result = await service.takePicture();

      expect(result).toBeInstanceOf(File);
      expect(result!.type).toBe('image/png');
    });

    it('should use metadata.format for the filename when available', async () => {
      const mockBlob = makeMockBlob('image/jpeg');
      vi.spyOn(Camera, 'takePhoto').mockResolvedValueOnce({
        webPath: 'test://photo.jpg',
        saved: false,
        metadata: { format: 'heic' },
      } as any);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        blob: async () => mockBlob,
      } as any);

      const result = await service.takePicture();

      expect(result!.name).toBe('photo.heic');
    });

    it('should fall back to MIME type extension when metadata format is not available', async () => {
      const mockBlob = makeMockBlob('image/jpeg');
      vi.spyOn(Camera, 'takePhoto').mockResolvedValueOnce({
        webPath: 'test://photo.jpg',
        saved: false,
        metadata: undefined,
      } as any);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        blob: async () => mockBlob,
      } as any);

      const result = await service.takePicture();

      expect(result!.name).toBe('camera-photo.jpeg');
    });

    it('should return null when Camera.takePhoto throws (user cancelled)', async () => {
      vi.spyOn(Camera, 'takePhoto').mockRejectedValueOnce(
        new Error('User cancelled')
      );

      const result = await service.takePicture();

      expect(result).toBeNull();
    });
  });

  describe('selectFromGallery', () => {
    it('should call Camera.chooseFromGallery', async () => {
      const mockBlob = makeMockBlob('image/jpeg');
      vi.spyOn(Camera, 'chooseFromGallery').mockResolvedValueOnce({
        results: [
          {
            webPath: 'test://photo.jpg',
            saved: false,
            metadata: { format: 'jpeg' },
          },
        ],
      } as any);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        blob: async () => mockBlob,
      } as any);

      await service.selectFromGallery();

      expect(Camera.chooseFromGallery).toHaveBeenCalledWith(
        expect.objectContaining({ includeMetadata: true })
      );
    });

    it('should return null when Camera.chooseFromGallery throws (user cancelled)', async () => {
      vi.spyOn(Camera, 'chooseFromGallery').mockRejectedValueOnce(
        new Error('User cancelled')
      );

      const result = await service.selectFromGallery();

      expect(result).toBeNull();
    });

    it('should return null when the gallery selection is empty', async () => {
      vi.spyOn(Camera, 'chooseFromGallery').mockResolvedValueOnce({
        results: [],
      } as any);

      const result = await service.selectFromGallery();

      expect(result).toBeNull();
    });

    it('should use gallery-photo as the base filename when format is not available', async () => {
      const mockBlob = makeMockBlob('image/png');
      vi.spyOn(Camera, 'chooseFromGallery').mockResolvedValueOnce({
        results: [
          {
            webPath: 'test://photo.png',
            saved: false,
            metadata: undefined,
          },
        ],
      } as any);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        blob: async () => mockBlob,
      } as any);

      const result = await service.selectFromGallery();

      expect(result!.name).toBe('gallery-photo.png');
    });
  });
});
