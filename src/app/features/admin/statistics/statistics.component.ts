import { DatePipe } from '@angular/common';
import { afterNextRender, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { environment } from '@env/environment';
import { AdminStatistics } from '@models/admin-statistics';
import { AdminStatisticsService } from '@services/admin-statistics.service';
import { AnalyticsService } from '@services/analytics.service';
import { getFunctions, httpsCallable } from 'firebase/functions';

@Component({
  selector: 'app-admin-statistics',
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
  imports: [MatCardModule, MatButtonModule, MatIconModule, DatePipe],
})
export class AdminStatisticsComponent {
  protected readonly statisticsService = inject(AdminStatisticsService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly functions = inject(getFunctions);

  isLocalEnvironment = signal<boolean>(!environment.production);
  isLiveData = signal<boolean>(!environment.useEmulators);

  statistics = signal<AdminStatistics | null>(null);
  error = signal<string | null>(null);

  constructor() {
    afterNextRender(async () => {
      await this.loadStatistics();
    });
  }

  async loadStatistics(): Promise<void> {
    this.loading.loadingOn();
    this.error.set(null);

    try {
      const stats = await this.statisticsService.getStatistics();
      this.statistics.set(stats);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load statistics';
      this.error.set(message);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message },
      });
      this.analytics.logEvent('error', {
        component: this.constructor.name,
        action: 'load_statistics',
        message,
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  async refreshStatistics(): Promise<void> {
    await this.loadStatistics();
  }

  async updateData(): Promise<void> {
    this.loading.loadingOn();
    try {
      const syncEmails = httpsCallable(this.functions, 'syncAuthEmailsToUsers');
      await Promise.all([syncEmails()]);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Data updated' },
      });
    } catch (error) {
      this.analytics.logEvent('error', {
        component: this.constructor.name,
        action: 'data_update',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Something went wrong - could not update data' },
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  forceTestError() {
    this.analytics.logEvent('error', {
      component: this.constructor.name,
      action: 'manual_test_trigger',
      message: 'Checking if Firebase is awake',
    });
    console.log('Test error triggered');
    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message: 'Test error triggered - check console and analytics' },
    });
  }
}
