import { Component, inject, Inject } from '@angular/core';
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
  private helpContentService = inject(HelpContentService);

  helpSection: HelpSection | undefined;
  displayTitle: string;

  constructor(@Inject(MAT_DIALOG_DATA) public data: HelpDialogData) {
    this.helpSection = this.helpContentService.getHelpSection(data.sectionId);
    this.displayTitle = data.title || this.helpSection?.title || 'Help';
  }
}
