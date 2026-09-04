import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ConfirmDialogComponent } from '@components/confirm-dialog/confirm-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import {
  ADMIN_REPORT_OPTIONS,
  AdminReportId,
  AdminReportTable,
} from '@models/admin-report';
import { AdminReportsService } from '@services/admin-reports.service';
import { AnalyticsService } from '@services/analytics.service';
import { AppCheckErrorHandlerService } from '@services/app-check-error-handler.service';
import { ReportsStore } from '@store/reports.store';

@Component({
  selector: 'app-admin-reports',
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsComponent {
  protected readonly reportsService = inject(AdminReportsService);
  protected readonly reportsStore = inject(ReportsStore);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly appCheckErrorHandler = inject(AppCheckErrorHandlerService);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly dialog = inject(MatDialog);

  protected readonly reportOptions = ADMIN_REPORT_OPTIONS;

  selectedReport = signal<AdminReportId>('overview');
  error = signal<string | null>(null);
  isMobile = signal(false);

  result = computed(() => this.reportsStore.results()[this.selectedReport()] ?? null);
  hasResult = computed(() => this.result() !== null);

  showRepairButton = computed(
    () =>
      this.selectedReport() === 'orphaned-members' ||
      this.selectedReport() === 'orphaned-registrations'
  );

  repairableCount = computed(() => {
    const report = this.result();
    if (!report) return 0;
    if (report.reportId === 'orphaned-members' || report.reportId === 'orphaned-registrations') {
      return report.tables[0]?.rows.length ?? 0;
    }
    return 0;
  });

  repairButtonLabel = computed(() => {
    const count = this.repairableCount();
    if (this.selectedReport() === 'orphaned-members') {
      return `Link ${count} Member${count === 1 ? '' : 's'}`;
    }
    if (this.selectedReport() === 'orphaned-registrations') {
      return `Backfill ${count} Registration${count === 1 ? '' : 's'}`;
    }
    return '';
  });

  constructor() {
    this.breakpointObserver
      .observe('(max-width: 799px)')
      .subscribe((result) => this.isMobile.set(result.matches));

    // Switching reports shows a different (possibly not-yet-loaded) result,
    // so any error from the previous report no longer applies.
    effect(() => {
      this.selectedReport();
      this.error.set(null);
    });
  }

  columnKeys(table: AdminReportTable): string[] {
    return table.columns.map((c) => c.key);
  }

  formatCell(value: string | number | boolean | null): string {
    if (value === null) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  }

  async loadReport(): Promise<void> {
    if (this.hasResult()) return;
    this.loading.loadingOn();
    this.error.set(null);
    try {
      const reportId = this.selectedReport();
      const result = await this.reportsService.runReport(reportId);
      this.reportsStore.setResult(reportId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run report';
      this.error.set(message);
      this.appCheckErrorHandler.handle(error, message);
      this.analytics.logError(
        'Admin Reports Component',
        'run_report',
        'Failed to run report',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      this.loading.loadingOff();
    }
  }

  async refreshReport(): Promise<void> {
    this.reportsStore.clearResult(this.selectedReport());
    await this.loadReport();
  }

  repair(): void {
    const report = this.result();
    if (!report) return;

    if (report.reportId === 'orphaned-members') {
      const paths = report.tables[0]?.rows.map((row) => row['path'] as string) ?? [];
      if (paths.length === 0) return;
      this.confirmRepair(
        'Link Orphaned Members',
        `This will set userRef on ${paths.length} member record(s). Continue?`,
        'Link Members',
        async () => {
          const { linkedCount } = await this.reportsService.repairOrphanedMembers(paths);
          return `Linked ${linkedCount} member record(s).`;
        }
      );
    } else if (report.reportId === 'orphaned-registrations') {
      const uids = report.tables[0]?.rows.map((row) => row['uid'] as string) ?? [];
      if (uids.length === 0) return;
      this.confirmRepair(
        'Backfill Orphaned Registrations',
        `This will create a Firestore user profile for ${uids.length} account(s). Continue?`,
        'Backfill',
        async () => {
          const { createdCount } =
            await this.reportsService.backfillOrphanedRegistrations(uids);
          return `Created ${createdCount} user profile(s).`;
        }
      );
    }
  }

  private confirmRepair(
    dialogTitle: string,
    confirmationText: string,
    confirmButtonText: string,
    action: () => Promise<string>
  ): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: { dialogTitle, confirmationText, confirmButtonText, cancelButtonText: 'Cancel' },
    });
    dialogRef.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      await this.runRepair(action);
    });
  }

  private async runRepair(action: () => Promise<string>): Promise<void> {
    this.loading.loadingOn();
    try {
      const message = await action();
      this.snackbar.openFromComponent(CustomSnackbarComponent, { data: { message } });
      const reportId = this.selectedReport();
      this.reportsStore.clearResult(reportId);
      await this.loadReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Repair action failed';
      this.appCheckErrorHandler.handle(error, message);
      this.analytics.logError(
        'Admin Reports Component',
        'repair_action',
        'Failed to run repair action',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      this.loading.loadingOff();
    }
  }
}
