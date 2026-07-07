import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MailDocument } from '@models/mail';

@Component({
  selector: 'app-email-detail-dialog',
  templateUrl: './email-detail-dialog.component.html',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailDetailDialogComponent {
  protected readonly data: MailDocument = inject(MAT_DIALOG_DATA);

  formatRecipient(to: string | string[]): string {
    return Array.isArray(to) ? to.join(', ') : to;
  }
}
