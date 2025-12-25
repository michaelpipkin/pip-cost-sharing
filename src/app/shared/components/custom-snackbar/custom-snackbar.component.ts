import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import {
  MAT_SNACK_BAR_DATA,
  MatSnackBarRef,
} from '@angular/material/snack-bar';

const SNACKBAR_DURATION = 4000;

@Component({
  selector: 'app-custom-snackbar',
  imports: [MatProgressSpinnerModule, MatIconModule, MatButtonModule],
  templateUrl: './custom-snackbar.component.html',
  styleUrl: './custom-snackbar.component.scss',
})
export class CustomSnackbarComponent {
  private snackBarRef = inject(MatSnackBarRef);
  private destroyRef = inject(DestroyRef);
  data = inject<{ message: string }>(MAT_SNACK_BAR_DATA);

  progress = signal(100);
  private intervalId: number | null = null;

  constructor() {
    afterNextRender(() => {
      const intervalMs = 50;
      const steps = SNACKBAR_DURATION / intervalMs;
      const decrement = 100 / steps;

      this.intervalId = window.setInterval(() => {
        this.progress.update((p) => p - decrement);
        if (this.progress() <= 0) {
          this.clearInterval();
        }
      }, intervalMs);
    });

    this.destroyRef.onDestroy(() => {
      this.clearInterval();
    });
  }

  dismiss() {
    this.snackBarRef.dismiss();
  }

  private clearInterval() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
