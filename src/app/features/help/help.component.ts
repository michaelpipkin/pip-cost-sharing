import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  email as emailValidator,
  form,
  FormField,
  maxLength,
  required,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  HelpContentService,
  HelpSection,
} from '@services/help-content.service';
import { HelpService } from '@services/help.service';

interface IssueForm {
  title: string;
  body: string;
  email: string;
}

@Component({
  selector: 'app-help',
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss',
  imports: [
    FormField,
    MatExpansionModule,
    MatDialogModule,
    MatFormFieldModule,
    MatButtonModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpComponent {
  protected readonly helpService = inject(HelpService);
  protected readonly helpContentService = inject(HelpContentService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);

  helpSections: HelpSection[] = [];

  protected readonly issueModel = signal<IssueForm>({
    title: '',
    body: '',
    email: '',
  });
  protected readonly hasFormContent = computed(() => {
    const f = this.issueModel();
    return f.title !== '' || f.body !== '' || f.email !== '';
  });

  protected readonly issueForm = form(this.issueModel, (p) => {
    required(p.title, { message: '*Required' });
    required(p.body, { message: '*Required' });
    maxLength(p.body, 2000, { message: 'Maximum 2000 characters' });
    emailValidator(p.email, { message: '*Invalid email address' });
  });

  constructor() {
    this.helpSections = this.helpContentService.getAllHelpSections();
  }

  clearForm(): void {
    this.issueForm().reset({ title: '', body: '', email: '' });
  }

  async onSubmit(): Promise<void> {
    this.loading.loadingOn();
    const f = this.issueForm().value();
    const body = f.email
      ? `${f.body}\n\nSubmitted by: ${f.email}`
      : f.body;

    try {
      const issue = await this.helpService.createIssue(f.title, body);
      this.clearForm();
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Issue submitted. Thank you!' },
      });
      this.analytics.logEvent('issue_created', {
        action: 'submit_issue',
      });

      try {
        await this.helpService.notifyAdminOfIssue(issue, f.body, f.email);
      } catch (notifyError) {
        this.analytics.logEvent('issue_notify_failed', {
          action: 'submit_issue',
          message:
            notifyError instanceof Error
              ? notifyError.message
              : 'Unknown error',
        });
      }
    } catch (error) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Error creating issue' },
      });
      this.analytics.logEvent('issue_create_failed', {
        action: 'submit_issue',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.loading.loadingOff();
    }
  }
}
