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
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule, Sort, SortDirection } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { DeleteDialogComponent } from '@components/delete-dialog/delete-dialog.component';
import { LoadingService } from '@components/loading/loading.service';
import { AppError } from '@models/app-error';
import { AdminErrorLogService } from '@services/admin-error-log.service';
import { AnalyticsService } from '@services/analytics.service';
import { ErrorDetailDialogComponent } from './error-detail-dialog.component';

type GroupedError = AppError & { count: number; ids: string[] };

@Component({
  selector: 'app-admin-error-log',
  templateUrl: './error-log.component.html',
  styleUrl: './error-log.component.scss',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSortModule,
    MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminErrorLogComponent {
  protected readonly errorLogService = inject(AdminErrorLogService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly dialog = inject(MatDialog);

  startDate = model<Date | null>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  endDate = model<Date | null>(new Date());
  errors = signal<AppError[]>([]);
  loadError = signal<string | null>(null);
  groupedView = model<boolean>(false);
  isMobile = signal(false);
  selectedErrorIds = signal<Set<string>>(new Set());

  sortActive = signal<string>('dateTime');
  sortDirection = signal<SortDirection>('desc');

  groupedErrors = computed<GroupedError[]>(() => {
    const map = new Map<string, GroupedError>();
    for (const e of this.errors()) {
      const key = `${e.component}|${e.action}|${e.message}|${e.error ?? ''}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        existing.ids.push(e.id);
      } else {
        map.set(key, { ...e, count: 1, ids: [e.id] });
      }
    }
    return [...map.values()];
  });

  displayedErrors = computed<(AppError | GroupedError)[]>(() => {
    const source: (AppError | GroupedError)[] = this.groupedView()
      ? this.groupedErrors()
      : this.errors();

    const col = this.sortActive();
    const dir = this.sortDirection();

    if (!col || dir === '') return source;

    return [...source].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      switch (col) {
        case 'component':
          valA = a.component;
          valB = b.component;
          break;
        case 'action':
          valA = a.action;
          valB = b.action;
          break;
        case 'message':
          valA = a.message;
          valB = b.message;
          break;
        case 'error':
          valA = a.error ?? '';
          valB = b.error ?? '';
          break;
        case 'dateTime':
          valA = a.timestamp?.toMillis() ?? 0;
          valB = b.timestamp?.toMillis() ?? 0;
          break;
        case 'count':
          valA = (a as GroupedError).count ?? 0;
          valB = (b as GroupedError).count ?? 0;
          break;
        default:
          return 0;
      }

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB as string);
        return dir === 'asc' ? cmp : -cmp;
      } else {
        return dir === 'asc'
          ? valA - (valB as number)
          : (valB as number) - valA;
      }
    });
  });

  columnsToDisplay = computed<string[]>(() => {
    const fifth = this.groupedView() ? 'count' : 'dateTime';
    const cols = this.isMobile()
      ? ['component', 'action', 'message', fifth]
      : ['component', 'action', 'message', 'error', fifth];
    return ['select', ...cols];
  });

  allSelected = computed<boolean>(() => {
    const rows = this.displayedErrors();
    return (
      rows.length > 0 &&
      rows.every((row) =>
        this.rowIds(row).every((id) => this.selectedErrorIds().has(id))
      )
    );
  });

  someSelected = computed<boolean>(() => {
    return this.selectedErrorIds().size > 0 && !this.allSelected();
  });

  hasSelection = computed<boolean>(() => this.selectedErrorIds().size > 0);

  constructor() {
    this.breakpointObserver
      .observe('(max-width: 799px)')
      .subscribe((result) => {
        this.isMobile.set(result.matches);
      });

    effect(() => {
      const fifth = this.groupedView() ? 'count' : 'dateTime';
      this.sortActive.set(fifth);
      this.sortDirection.set('desc');
      this.selectedErrorIds.set(new Set());
    });

    afterNextRender(async () => {
      await this.loadErrors();
    });
  }

  async loadErrors(): Promise<void> {
    const start = this.startDate();
    const end = this.endDate();
    if (!start || !end) return;
    this.loading.loadingOn();
    this.loadError.set(null);
    try {
      const data = await this.errorLogService.getAppErrors(start, end);
      this.errors.set(data);
      this.selectedErrorIds.set(new Set());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load error log';
      this.loadError.set(message);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message },
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  onRowClick(row: AppError | GroupedError): void {
    const detailRef = this.dialog.open(ErrorDetailDialogComponent, {
      data: row,
    });
    detailRef.afterClosed().subscribe((deleteRequested) => {
      if (!deleteRequested) return;
      const isGrouped = 'ids' in row;
      const confirmRef = this.dialog.open(DeleteDialogComponent, {
        data: {
          operation: 'Delete',
          target: isGrouped ? 'these errors' : 'this error',
        },
      });
      confirmRef.afterClosed().subscribe(async (confirmed) => {
        if (!confirmed) return;
        await this.deleteError(row);
      });
    });
  }

  async deleteError(row: AppError | GroupedError): Promise<void> {
    this.loading.loadingOn();
    try {
      const idsToDelete = new Set(this.rowIds(row));
      if ('ids' in row) {
        await this.errorLogService.deleteAppErrors(row.ids);
      } else {
        await this.errorLogService.deleteAppError(row.id);
      }
      this.errors.update((errors) =>
        errors.filter((e) => !idsToDelete.has(e.id))
      );
      this.selectedErrorIds.update((selected) => {
        const next = new Set(selected);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Error(s) deleted successfully' },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete error(s)';
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message },
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  async clearErrors(): Promise<void> {
    const confirmRef = this.dialog.open(DeleteDialogComponent, {
      data: {
        operation: 'Delete',
        target: 'all errors in the current view',
      },
    });
    confirmRef.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      this.loading.loadingOn();
      try {
        const idsToDelete = this.groupedView()
          ? this.groupedErrors().flatMap((e) => e.ids)
          : this.errors().map((e) => e.id);
        await this.errorLogService.deleteAppErrors(idsToDelete);
        this.errors.set([]);
        this.selectedErrorIds.set(new Set());
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Errors deleted successfully' },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete errors';
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message },
        });
      } finally {
        this.loading.loadingOff();
      }
    });
  }

  deleteSelected(): void {
    const confirmRef = this.dialog.open(DeleteDialogComponent, {
      data: {
        operation: 'Delete',
        target: 'the selected error(s)',
      },
    });
    confirmRef.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      this.loading.loadingOn();
      try {
        const idsToDelete = [...this.selectedErrorIds()];
        await this.errorLogService.deleteAppErrors(idsToDelete);
        const deleted = new Set(idsToDelete);
        this.errors.update((errors) =>
          errors.filter((e) => !deleted.has(e.id))
        );
        this.selectedErrorIds.set(new Set());
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Errors deleted successfully' },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete errors';
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message },
        });
      } finally {
        this.loading.loadingOff();
      }
    });
  }

  onSortChange(sort: Sort): void {
    this.sortActive.set(sort.active);
    this.sortDirection.set(sort.direction);
  }

  asGroupedError(row: AppError | GroupedError): GroupedError {
    return row as GroupedError;
  }

  rowIds(row: AppError | GroupedError): string[] {
    return 'ids' in row ? row.ids : [row.id];
  }

  isRowSelected(row: AppError | GroupedError): boolean {
    return this.rowIds(row).every((id) => this.selectedErrorIds().has(id));
  }

  toggleRow(row: AppError | GroupedError): void {
    const ids = this.rowIds(row);
    this.selectedErrorIds.update((selected) => {
      const next = new Set(selected);
      if (this.isRowSelected(row)) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selectedErrorIds.set(new Set());
    } else {
      this.selectedErrorIds.set(
        new Set(this.displayedErrors().flatMap((row) => this.rowIds(row)))
      );
    }
  }
}
