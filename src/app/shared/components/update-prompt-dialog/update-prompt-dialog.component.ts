import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

// Closes with `true` when the user taps Update, `false`/undefined otherwise;
// the caller (AppUpdatePromptService) owns opening the store listing.
@Component({
  selector: 'app-update-prompt-dialog',
  templateUrl: './update-prompt-dialog.component.html',
  styleUrl: './update-prompt-dialog.component.scss',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdatePromptDialogComponent {}
