import { Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  standalone: true,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose],
})
export class ConfirmDialogComponent {
  data: confirmData = inject(MAT_DIALOG_DATA);
}

type confirmData = {
  dialogTitle: string;
  confirmationText: string;
  cancelButtonText: string;
  confirmButtonText: string;
};
