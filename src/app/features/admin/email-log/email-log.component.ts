import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { DeleteDialogComponent } from '@components/delete-dialog/delete-dialog.component';
import { LoadingService } from '@components/loading/loading.service';
import { MailDelivery, MailDocument } from '@models/mail';
import { AdminMailService } from '@services/admin-mail.service';
import { AnalyticsService } from '@services/analytics.service';
import { EmailDetailDialogComponent } from './email-detail-dialog.component';

type DeliveryStateFilter = 'ALL' | MailDelivery['state'];

@Component({
  selector: 'app-admin-email-log',
  templateUrl: './email-log.component.html',
  styleUrl: './email-log.component.scss',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatIconModule,
    MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEmailLogComponent {
  protected readonly mailService = inject(AdminMailService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly dialog = inject(MatDialog);

  mailDocuments = signal<MailDocument[]>([]);
  selectedState = model<DeliveryStateFilter>('ALL');
  error = signal<string | null>(null);
  isMobile = signal(false);
  selectedMailIds = signal<Set<string>>(new Set());

  readonly stateFilters: DeliveryStateFilter[] = [
    'ALL',
    'PENDING',
    'PROCESSING',
    'SUCCESS',
    'ERROR',
    'RETRY',
  ];

  get chipGroups(): DeliveryStateFilter[][] {
    const groupSize = Math.ceil(this.stateFilters.length / 2);
    const groups: DeliveryStateFilter[][] = [];
    for (let i = 0; i < this.stateFilters.length; i += groupSize) {
      groups.push(this.stateFilters.slice(i, i + groupSize));
    }
    return groups;
  }

  columnsToDisplay = computed(() => {
    const base = ['dateTime', 'recipient', 'state', 'attempts', 'error'];
    const cols = this.isMobile()
      ? base
      : ['dateTime', 'recipient', 'subject', ...base.slice(2)];
    return ['select', ...cols];
  });

  filteredDocuments = computed<MailDocument[]>(() => {
    const state = this.selectedState();
    if (state === 'ALL') return this.mailDocuments();
    return this.mailDocuments().filter((doc) => doc.delivery?.state === state);
  });

  allSelected = computed<boolean>(() => {
    const docs = this.filteredDocuments();
    return (
      docs.length > 0 && docs.every((d) => this.selectedMailIds().has(d.id))
    );
  });

  someSelected = computed<boolean>(() => {
    return this.selectedMailIds().size > 0 && !this.allSelected();
  });

  hasSelection = computed<boolean>(() => this.selectedMailIds().size > 0);

  constructor() {
    this.breakpointObserver
      .observe('(max-width: 799px)')
      .subscribe((result) => {
        this.isMobile.set(result.matches);
      });

    effect(() => {
      this.selectedState();
      this.selectedMailIds.set(new Set());
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
      this.selectedMailIds.set(new Set());
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
    const detailRef = this.dialog.open(EmailDetailDialogComponent, {
      data: row,
    });
    detailRef.afterClosed().subscribe((deleteRequested) => {
      if (!deleteRequested) return;
      const confirmRef = this.dialog.open(DeleteDialogComponent, {
        data: { operation: 'Delete', target: 'this email' },
      });
      confirmRef.afterClosed().subscribe(async (confirmed) => {
        if (!confirmed) return;
        await this.deleteMailDocument(row);
      });
    });
  }

  async deleteMailDocument(row: MailDocument): Promise<void> {
    this.loading.loadingOn();
    try {
      await this.mailService.deleteMailDocument(row.id);
      this.mailDocuments.update((docs) => docs.filter((d) => d.id !== row.id));
      this.selectedMailIds.update((selected) => {
        const next = new Set(selected);
        next.delete(row.id);
        return next;
      });
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Email deleted successfully' },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete email';
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message },
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  deleteSelected(): void {
    const confirmRef = this.dialog.open(DeleteDialogComponent, {
      data: { operation: 'Delete', target: 'the selected email(s)' },
    });
    confirmRef.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      this.loading.loadingOn();
      try {
        const idsToDelete = [...this.selectedMailIds()];
        await this.mailService.deleteMailDocuments(idsToDelete);
        const deleted = new Set(idsToDelete);
        this.mailDocuments.update((docs) =>
          docs.filter((d) => !deleted.has(d.id))
        );
        this.selectedMailIds.set(new Set());
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Emails deleted successfully' },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete emails';
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message },
        });
      } finally {
        this.loading.loadingOff();
      }
    });
  }

  clearLog(): void {
    const confirmRef = this.dialog.open(DeleteDialogComponent, {
      data: { operation: 'Delete', target: 'all emails in the current view' },
    });
    confirmRef.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      this.loading.loadingOn();
      try {
        const idsToDelete = this.filteredDocuments().map((d) => d.id);
        await this.mailService.deleteMailDocuments(idsToDelete);
        const deleted = new Set(idsToDelete);
        this.mailDocuments.update((docs) =>
          docs.filter((d) => !deleted.has(d.id))
        );
        this.selectedMailIds.set(new Set());
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Emails deleted successfully' },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete emails';
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message },
        });
      } finally {
        this.loading.loadingOff();
      }
    });
  }

  isRowSelected(row: MailDocument): boolean {
    return this.selectedMailIds().has(row.id);
  }

  toggleRow(row: MailDocument): void {
    this.selectedMailIds.update((selected) => {
      const next = new Set(selected);
      if (next.has(row.id)) {
        next.delete(row.id);
      } else {
        next.add(row.id);
      }
      return next;
    });
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selectedMailIds.set(new Set());
    } else {
      this.selectedMailIds.set(
        new Set(this.filteredDocuments().map((d) => d.id))
      );
    }
  }

  formatRecipient(to: string | string[]): string {
    return Array.isArray(to) ? to.join(', ') : to;
  }

  truncate(text: string | undefined, maxLength = 60): string {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
  }
}
