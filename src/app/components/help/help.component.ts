import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { HelpService } from '@services/help.service';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  HelpContentService,
  HelpSection,
} from '@services/help-content.service';

@Component({
  selector: 'app-help',
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss',
  imports: [
    MatExpansionModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatButtonModule,
    MatInputModule,
  ],
})
export class HelpComponent {
  protected readonly helpService = inject(HelpService);
  protected readonly helpContentService = inject(HelpContentService);
  protected readonly loading = inject(LoadingService);
  protected readonly fb = inject(FormBuilder);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);

  helpSections: HelpSection[] = [];

  issueForm = this.fb.group({
    title: ['', Validators.required],
    body: ['', Validators.required],
    email: ['', Validators.email],
  });

  constructor() {
    this.helpSections = this.helpContentService.getAllHelpSections();
  }

  public get f() {
    return this.issueForm.controls;
  }

  clearForm(): void {
    this.issueForm.reset();
    this.issueForm.markAsPristine();
    this.issueForm.markAsUntouched();
  }

  onSubmit(): void {
    this.loading.loadingOn();
    const issue = this.issueForm.value;
    const body = !!issue.email
      ? `${issue.body}\n\nSubmitted by: ${issue.email}`
      : issue.body;

    this.helpService.createIssue(issue.title, body).subscribe({
      next: () => {
        // Success callback
        this.clearForm();
        this.loading.loadingOff();
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Issue submitted. Thank you!' },
        });
      },
      error: (err: Error) => {
        // Error callback
        this.loading.loadingOff();
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Error creating issue' },
        });
        this.analytics.logEvent('issue_created', {
          action: 'submit_issue',
          message: err.message,
        });
      },
    });
  }
}
