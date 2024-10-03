import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
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
