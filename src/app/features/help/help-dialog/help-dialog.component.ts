import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import {
  HelpContentService,
  HelpSection,
} from '../../../services/help-content.service';

export interface HelpDialogData {
  sectionId: string;
  title?: string; // Optional override for the title
}

@Component({
  selector: 'app-help-dialog',
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './help-dialog.component.html',
  styleUrl: './help-dialog.component.scss',
})
export class HelpDialogComponent {
  protected readonly helpContentService = inject(HelpContentService);
  protected readonly data: HelpDialogData = inject(MAT_DIALOG_DATA);

  helpSection: HelpSection | undefined;
  displayTitle: string;

  constructor() {
    this.helpSection = this.helpContentService.getHelpSection(
      this.data.sectionId
    );
    this.displayTitle = this.data.title || this.helpSection?.title || 'Help';
  }
}
