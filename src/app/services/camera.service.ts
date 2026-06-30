import { Injectable } from '@angular/core';
import { Camera, MediaResult } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class CameraService {
  isAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }

  async takePicture(): Promise<File | null> {
    try {
      const result = await Camera.takePhoto({
        quality: 80,
        correctOrientation: true,
        targetWidth: 1200,
        targetHeight: 2400,
        includeMetadata: true,
      });
      return await this.convertMediaToFile(result, 'camera-photo.jpg');
    } catch (error) {
      console.error('Error taking picture:', error);
      return null;
    }
  }

  async selectFromGallery(): Promise<File | null> {
    try {
      const { results } = await Camera.chooseFromGallery({
        quality: 80,
        correctOrientation: true,
        targetWidth: 1200,
        targetHeight: 2400,
        includeMetadata: true,
      });
      const [first] = results;
      if (!first) return null;
      return await this.convertMediaToFile(first, 'gallery-photo.jpg');
    } catch (error) {
      console.error('Error selecting from gallery:', error);
      return null;
    }
  }

  private async convertMediaToFile(
    media: MediaResult,
    fileName: string
  ): Promise<File> {
    const response = await fetch(media.webPath!);
    const blob = await response.blob();
    const mimeType = blob.type || 'image/jpeg';
    const extension = mimeType.split('/')[1] || 'jpg';
    const format = media.metadata?.format;
    const actualFileName = format
      ? `photo.${format}`
      : `${fileName.split('.')[0]}.${extension}`;
    return new File([blob], actualFileName, {
      type: mimeType,
      lastModified: Date.now(),
    });
  }
}
