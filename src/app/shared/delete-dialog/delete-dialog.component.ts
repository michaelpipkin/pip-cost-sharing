import { Component, Inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
} from '@angular/material/dialog';

@Component({
  selector: 'app-delete-dialog',
  templateUrl: './delete-dialog.component.html',
  styleUrl: './delete-dialog.component.scss',
  standalone: true,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions],
})
export class DeleteDialogComponent {
  operation: string = '';
  target: string = '';

  constructor(
    private dialogRef: MatDialogRef<DeleteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data
  ) {
    this.operation = data.operation;
    this.target = data.target;
  }

  close(confirm: boolean): void {
    this.dialogRef.close(confirm);
  }
}
