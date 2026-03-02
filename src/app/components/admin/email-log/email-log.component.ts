import {
  afterNextRender,
  Component,
  computed,
  inject,
  model,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MailDelivery, MailDocument } from '@models/mail';
import { AdminMailService } from '@services/admin-mail.service';
import { AnalyticsService } from '@services/analytics.service';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@shared/loading/loading.service';

type DeliveryStateFilter = 'ALL' | MailDelivery['state'];

@Component({
  selector: 'app-admin-email-log',
  templateUrl: './email-log.component.html',
  styleUrl: './email-log.component.scss',
  imports: [
    DatePipe,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatTableModule,
  ],
})
export class AdminEmailLogComponent {
  protected readonly mailService = inject(AdminMailService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);

  mailDocuments = signal<MailDocument[]>([]);
  selectedState = model<DeliveryStateFilter>('ALL');
  error = signal<string | null>(null);
  expandedRow = model<MailDocument | null>(null);

  readonly stateFilters: DeliveryStateFilter[] = [
    'ALL',
    'PENDING',
    'PROCESSING',
    'SUCCESS',
    'ERROR',
    'RETRY',
  ];

  readonly columnsToDisplay = [
    'dateTime',
    'recipient',
    'subject',
    'state',
    'attempts',
    'error',
  ];

  filteredDocuments = computed<MailDocument[]>(() => {
    const state = this.selectedState();
    if (state === 'ALL') return this.mailDocuments();
    return this.mailDocuments().filter(
      (doc) => doc.delivery?.state === state
    );
  });

  constructor() {
    afterNextRender(async () => {
      await this.loadMailDocuments();
    });
  }

  async loadMailDocuments(): Promise<void> {
    this.loading.loadingOn();
    this.error.set(null);
    try {
      const docs = await this.mailService.getMailDocuments();
      this.mailDocuments.set(docs);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load email log';
      this.error.set(message);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message },
      });
      this.analytics.logEvent('error', {
        component: this.constructor.name,
        action: 'load_mail_documents',
        message,
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  chipTextColor(filter: DeliveryStateFilter): string {
    switch (filter) {
      case 'SUCCESS': return 'var(--on-primary)';
      case 'ERROR':   return 'var(--on-error)';
      case 'RETRY':   return 'var(--on-tertiary)';
      default:        return 'var(--on-surface)';
    }
  }

  onRowClick(row: MailDocument): void {
    this.expandedRow.update((current) => (current === row ? null : row));
  }

  formatRecipient(to: string | string[]): string {
    return Array.isArray(to) ? to.join(', ') : to;
  }

  truncate(text: string | undefined, maxLength = 60): string {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
  }
}
