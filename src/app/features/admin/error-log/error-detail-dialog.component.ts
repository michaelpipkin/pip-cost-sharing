import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { AppError } from '@models/app-error';

type GroupedError = AppError & { count: number };

@Component({
  selector: 'app-error-detail-dialog',
  templateUrl: './error-detail-dialog.component.html',
  imports: [DatePipe, MatDialogModule, MatButtonModule],
})
export class ErrorDetailDialogComponent {
  protected readonly data: AppError | GroupedError = inject(MAT_DIALOG_DATA);

  isGrouped(): boolean {
    return 'count' in this.data;
  }

  asGrouped(): GroupedError {
    return this.data as GroupedError;
  }
}
