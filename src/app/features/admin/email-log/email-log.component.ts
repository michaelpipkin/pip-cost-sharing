import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  inject,
  model,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { MailDelivery, MailDocument } from '@models/mail';
import { AdminMailService } from '@services/admin-mail.service';
import { AnalyticsService } from '@services/analytics.service';

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
  protected readonly breakpointObserver = inject(BreakpointObserver);

  mailDocuments = signal<MailDocument[]>([]);
  selectedState = model<DeliveryStateFilter>('ALL');
  error = signal<string | null>(null);
  expandedRow = model<MailDocument | null>(null);
  isMobile = signal(false);

  readonly stateFilters: DeliveryStateFilter[] = [
    'ALL',
    'PENDING',
    'PROCESSING',
    'SUCCESS',
    'ERROR',
    'RETRY',
  ];

  columnsToDisplay = computed(() => {
    const base = ['dateTime', 'recipient', 'state', 'attempts', 'error'];
    return this.isMobile()
      ? base
      : ['dateTime', 'recipient', 'subject', ...base.slice(2)];
  });

  filteredDocuments = computed<MailDocument[]>(() => {
    const state = this.selectedState();
    if (state === 'ALL') return this.mailDocuments();
    return this.mailDocuments().filter((doc) => doc.delivery?.state === state);
  });

  constructor() {
    this.breakpointObserver
      .observe('(max-width: 799px)')
      .subscribe((result) => {
        this.isMobile.set(result.matches);
      });
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load email log';
      this.error.set(message);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message },
      });
      this.analytics.logError(
        'Admin Email Log Component',
        'load_mail_documents',
        'Failed to load mail documents',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      this.loading.loadingOff();
    }
  }

  chipTextColor(filter: DeliveryStateFilter): string {
    switch (filter) {
      case 'SUCCESS':
        return 'var(--on-primary)';
      case 'ERROR':
        return 'var(--on-error)';
      case 'RETRY':
        return 'var(--on-tertiary)';
      default:
        return 'var(--on-surface)';
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
