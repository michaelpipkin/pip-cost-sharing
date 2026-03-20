import { DatePipe } from '@angular/common';
import { afterNextRender, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { environment } from '@env/environment';
import { AdminStatisticsService } from '@services/admin-statistics.service';
import { AnalyticsService } from '@services/analytics.service';
import { StatisticsStore } from '@store/statistics.store';
import { getFunctions } from 'firebase/functions';

@Component({
  selector: 'app-admin-statistics',
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
  imports: [MatCardModule, MatButtonModule, MatIconModule, DatePipe],
})
export class AdminStatisticsComponent {
  protected readonly statisticsService = inject(AdminStatisticsService);
  protected readonly statisticsStore = inject(StatisticsStore);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly functions = inject(getFunctions);

  isLocalEnvironment = signal<boolean>(!environment.production);
  isLiveData = signal<boolean>(!environment.useEmulators);
  showTestErrorButton: boolean = false;
  showUpdateDataButton: boolean = false;

  error = signal<string | null>(null);

  constructor() {
    afterNextRender(async () => {
      await this.loadStatistics();
    });
  }

  async loadStatistics(): Promise<void> {
    if (this.statisticsStore.loaded()) return;
    this.loading.loadingOn();
    this.error.set(null);

    try {
      const stats = await this.statisticsService.getStatistics();
      this.statisticsStore.setStatistics(stats);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load statistics';
      this.error.set(message);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message },
      });
      this.analytics.logError(
        'Admin Statistics Component',
        'load_statistics',
        'Failed to load statistics',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      this.loading.loadingOff();
    }
  }

  async refreshStatistics(): Promise<void> {
    this.statisticsStore.clearStatistics();
    await this.loadStatistics();
  }

  async updateData(): Promise<void> {
    this.loading.loadingOn();
    try {
      await Promise.all([]);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Data updated' },
      });
    } catch (error) {
      this.analytics.logError(
        'Admin Statistics Component',
        'data_update',
        'Failed to update data',
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Something went wrong - could not update data' },
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  forceTestError() {
    this.analytics.logError(
      'Admin Statistics Component',
      'manual_test_trigger',
      'Checking if Firebase is awake',
      'N/A'
    );
    console.log('Test error triggered');
    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message: 'Test error triggered - check console and analytics' },
    });
  }
}
