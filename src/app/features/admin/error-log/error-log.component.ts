import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import {
  afterNextRender,
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
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule, Sort, SortDirection } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { DeleteDialogComponent } from '@components/delete-dialog/delete-dialog.component';
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
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSortModule,
    MatTableModule,
  ],
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
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });
  });

  columnsToDisplay = computed<string[]>(() => {
    const fifth = this.groupedView() ? 'count' : 'dateTime';
    return this.isMobile()
      ? ['component', 'action', 'message', fifth]
      : ['component', 'action', 'message', 'error', fifth];
  });

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
      if ('ids' in row) {
        await this.errorLogService.deleteAppErrors(row.ids);
        const idsToDelete = new Set(row.ids);
        this.errors.update((errors) => errors.filter((e) => !idsToDelete.has(e.id)));
      } else {
        await this.errorLogService.deleteAppError(row.id);
        this.errors.update((errors) => errors.filter((e) => e.id !== row.id));
      }
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

  onSortChange(sort: Sort): void {
    this.sortActive.set(sort.active);
    this.sortDirection.set(sort.direction);
  }

  asGroupedError(row: AppError | GroupedError): GroupedError {
    return row as GroupedError;
  }
}
