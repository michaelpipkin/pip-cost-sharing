import { Component, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';

@Component({
  selector: 'app-receipt-dialog',
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule, FormsModule],
  templateUrl: './receipt-dialog.component.html',
  styleUrl: './receipt-dialog.component.scss',
})
export class ReceiptDialogComponent {
  protected readonly userService = inject(UserService);
  protected readonly dialogRef = inject(MatDialogRef<ReceiptDialogComponent>);
  protected readonly loading = inject(LoadingService);

  title = 'PipSplit Receipt Retention Policy';
  acknowledged = model<boolean>(false);

  async acknowledgePolicy(): Promise<void> {
    this.loading.loadingOn();
    await this.userService.updateUser({ receiptPolicy: true });
    this.dialogRef.close(true);
    this.loading.loadingOff();
  }
}
