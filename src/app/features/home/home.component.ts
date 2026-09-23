import { ChangeDetectionStrategy, Component, inject, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '@services/analytics.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { UserStore } from '@store/user.store';
import { FeatureTourDialogComponent } from './feature-tour-dialog/feature-tour-dialog.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  imports: [RouterLink, MatIconModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected readonly userStore = inject(UserStore);
  protected readonly pwaDetection = inject(PwaDetectionService);
  protected readonly dialog = inject(MatDialog);
  protected readonly analytics = inject(AnalyticsService);

  isLoggedIn: Signal<boolean> = this.userStore.isLoggedIn;

  isRunningInBrowser(): boolean {
    return this.pwaDetection.isRunningInBrowser();
  }

  isRunningAsApp(): boolean {
    return this.pwaDetection.isRunningAsApp();
  }

  openFeatureTour(): void {
    this.analytics.logEvent('feature_tour_opened', {
      logged_in: this.isLoggedIn(),
    });
    this.dialog.open(FeatureTourDialogComponent, {
      width: '680px',
      maxWidth: '95vw',
      autoFocus: 'dialog',
    });
  }
}
