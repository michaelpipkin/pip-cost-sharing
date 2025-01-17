import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HelpService } from '@services/help.service';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics } from 'firebase/analytics';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

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
  helpService = inject(HelpService);
  loading = inject(LoadingService);
  fb = inject(FormBuilder);
  snackBar = inject(MatSnackBar);
  analytics = inject(getAnalytics);

  issueForm = this.fb.group({
    title: ['', Validators.required],
    body: ['', Validators.required],
    email: ['', Validators.email],
  });

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
        this.snackBar.open('Issue submitted. Thank you!', 'OK');
      },
      error: (err: Error) => {
        // Error callback
        this.loading.loadingOff();
        this.snackBar.open('Error creating issue', 'OK');
        this.analytics.logEvent('issue_created', {
          action: 'submit_issue',
          message: err.message,
        });
      },
    });
  }
}
