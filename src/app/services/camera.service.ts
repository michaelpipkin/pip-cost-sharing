import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

/**
 * Service for handling camera and photo gallery operations
 * Uses Capacitor Camera plugin for native functionality
 */
@Injectable({
  providedIn: 'root',
})
export class CameraService {
  /**
   * Check if camera/gallery functionality is available
   * Only available on native platforms (iOS, Android)
   */
  isAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Take a photo using the device camera
   * @returns File object of the captured photo, or null if cancelled/failed
   */
  async takePicture(): Promise<File | null> {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        correctOrientation: true,
        width: 1200, // Optimized for receipt width (portrait orientation)
        height: 2400, // 2:1 aspect ratio - typical for receipts
      });

      return await this.convertPhotoToFile(photo, 'camera-photo.jpg');
    } catch (error) {
      console.error('Error taking picture:', error);
      // User cancelled or permission denied
      return null;
    }
  }

  /**
   * Select a photo from the device's photo gallery
   * @returns File object of the selected photo, or null if cancelled/failed
   */
  async selectFromGallery(): Promise<File | null> {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
        correctOrientation: true,
        width: 1200, // Optimized for receipt width (portrait orientation)
        height: 2400, // 2:1 aspect ratio - typical for receipts
      });

      return await this.convertPhotoToFile(photo, 'gallery-photo.jpg');
    } catch (error) {
      console.error('Error selecting from gallery:', error);
      // User cancelled or permission denied
      return null;
    }
  }

  /**
   * Convert a Capacitor Photo object to a File object
   * @param photo The Photo object from Capacitor Camera
   * @param fileName Default filename to use
   * @returns File object
   */
  private async convertPhotoToFile(
    photo: Photo,
    fileName: string
  ): Promise<File> {
    // Fetch the photo as a blob
    const response = await fetch(photo.webPath!);
    const blob = await response.blob();

    // Determine the actual MIME type from the blob, or use a default
    const mimeType = blob.type || 'image/jpeg';

    // Extract extension from MIME type or use .jpg as default
    const extension = mimeType.split('/')[1] || 'jpg';

    // Use the actual file format if available from the photo, otherwise use our default
    const actualFileName = photo.format
      ? `photo.${photo.format}`
      : `${fileName.split('.')[0]}.${extension}`;

    // Create a File object from the blob
    return new File([blob], actualFileName, {
      type: mimeType,
      lastModified: Date.now(),
    });
  }
}
