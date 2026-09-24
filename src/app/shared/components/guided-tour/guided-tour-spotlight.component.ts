import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  GUIDED_TOUR_SPOTLIGHT_PADDING,
  GuidedTourService,
} from '@services/guided-tour.service';

/**
 * Full-viewport layer that dims the page except for a hole around the current
 * step's target. It also swallows pointer events, which is what locks the page
 * while a tour runs.
 */
@Component({
  selector: 'app-guided-tour-spotlight',
  template: `
    <div
      class="guided-tour-hole"
      [class.no-target]="!hole()"
      [style.top.px]="hole()?.top"
      [style.left.px]="hole()?.left"
      [style.width.px]="hole()?.width ?? 0"
      [style.height.px]="hole()?.height ?? 0"
    ></div>
  `,
  styleUrl: './guided-tour-spotlight.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    'data-testid': 'guided-tour-spotlight',
  },
})
export class GuidedTourSpotlightComponent {
  protected readonly tour = inject(GuidedTourService);

  protected readonly hole = computed(() => {
    const rect = this.tour.targetRect();
    if (!rect) return null;
    const pad = GUIDED_TOUR_SPOTLIGHT_PADDING;
    return {
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
  });
}
