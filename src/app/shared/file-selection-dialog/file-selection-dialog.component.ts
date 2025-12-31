import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export type FileSelectionOption = 'camera' | 'gallery' | 'file' | 'clipboard';

export type FileSelectionDialogData = {
  showCameraOption: boolean;
  showGalleryOption: boolean;
  showClipboardOption: boolean;
};

@Component({
  selector: 'app-file-selection-dialog',
  templateUrl: './file-selection-dialog.component.html',
  styleUrl: './file-selection-dialog.component.scss',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
})
export class FileSelectionDialogComponent {
  protected readonly data: FileSelectionDialogData = inject(MAT_DIALOG_DATA);
}
