import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminStatistics } from '@models/admin-statistics';
import { AdminStatisticsService } from '@services/admin-statistics.service';
import { AnalyticsService } from '@services/analytics.service';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@shared/loading/loading.service';

@Component({
  selector: 'app-admin-statistics',
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss',
  imports: [MatCardModule, MatButtonModule, MatIconModule, DatePipe],
})
export class AdminStatisticsComponent implements OnInit {
  private readonly statisticsService = inject(AdminStatisticsService);
  private readonly loading = inject(LoadingService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly analytics = inject(AnalyticsService);

  statistics = signal<AdminStatistics | null>(null);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadStatistics();
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
}
