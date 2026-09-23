import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { AnalyticsService } from '@services/analytics.service';
import { UserStore } from '@store/user.store';
import {
  FEATURE_TOUR_SLIDES,
  featureTourImagePath,
} from './feature-tour-slides';

export type FeatureTourCta = 'done' | 'split' | 'register';

const SWIPE_THRESHOLD_PX = 50;
const MOBILE_IMAGE_QUERY = '(max-width: 600px)';

@Component({
  selector: 'app-feature-tour-dialog',
  templateUrl: './feature-tour-dialog.component.html',
  styleUrl: './feature-tour-dialog.component.scss',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.arrowleft)': 'prev()',
    '(document:keydown.arrowright)': 'next()',
  },
})
export class FeatureTourDialogComponent {
  protected readonly dialogRef = inject(
    MatDialogRef<FeatureTourDialogComponent>
  );
  protected readonly userStore = inject(UserStore);
  protected readonly router = inject(Router);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly document = inject(DOCUMENT);

  protected readonly slides = FEATURE_TOUR_SLIDES;
  protected readonly imagePath = featureTourImagePath;
  protected readonly mobileImageQuery = MOBILE_IMAGE_QUERY;

  currentIndex = signal(0);
  // next/prev/goTo keep currentIndex within bounds
  slide = computed(() => this.slides[this.currentIndex()]!);
  isFirst = computed(() => this.currentIndex() === 0);
  isLast = computed(() => this.currentIndex() === this.slides.length - 1);
  isLoggedIn = this.userStore.isLoggedIn;

  #pointerStartX: number | null = null;

  constructor() {
    effect(() => {
      this.analytics.logEvent('feature_tour_slide_viewed', {
        index: this.currentIndex(),
        slide_id: this.slide().id,
      });
    });

    // Warm the cache for the next screenshot so advancing doesn't flash
    effect(() => {
      const nextSlide = this.slides[this.currentIndex() + 1];
      const view = this.document.defaultView;
      if (!nextSlide || !view) return;
      const size = view.matchMedia(MOBILE_IMAGE_QUERY).matches
        ? 'mobile'
        : 'desktop';
      new view.Image().src = featureTourImagePath(nextSlide, size);
    });
  }

  next(): void {
    if (!this.isLast()) this.currentIndex.update((i) => i + 1);
  }

  prev(): void {
    if (!this.isFirst()) this.currentIndex.update((i) => i - 1);
  }

  goTo(index: number): void {
    if (index >= 0 && index < this.slides.length) this.currentIndex.set(index);
  }

  onPointerDown(event: PointerEvent): void {
    this.#pointerStartX = event.clientX;
  }

  onPointerUp(event: PointerEvent): void {
    if (this.#pointerStartX === null) return;
    const deltaX = event.clientX - this.#pointerStartX;
    this.#pointerStartX = null;
    if (deltaX <= -SWIPE_THRESHOLD_PX) this.next();
    else if (deltaX >= SWIPE_THRESHOLD_PX) this.prev();
  }

  finish(target: FeatureTourCta): void {
    this.analytics.logEvent('feature_tour_cta', { target });
    this.dialogRef.close();
    if (target === 'split') {
      this.router.navigateByUrl(ROUTE_PATHS.SPLIT);
    } else if (target === 'register') {
      this.router.navigateByUrl(ROUTE_PATHS.AUTH_REGISTER);
    }
  }
}
