import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-delete-dialog',
  templateUrl: './delete-dialog.component.html',
  styleUrl: './delete-dialog.component.scss',
  imports: [MatDialogModule, MatButtonModule],
})
export class DeleteDialogComponent {
  protected readonly data: { operation: string; target: string } =
    inject(MAT_DIALOG_DATA);

  operation = signal<string>(this.data.operation);
  target = signal<string>(this.data.target);
}
