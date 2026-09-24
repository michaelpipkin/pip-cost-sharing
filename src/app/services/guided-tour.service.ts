import {
  ConnectedPosition,
  FlexibleConnectedPositionStrategy,
  Overlay,
  OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ApplicationRef,
  computed,
  DOCUMENT,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { GuidedTourCardComponent } from '@components/guided-tour/guided-tour-card.component';
import { GuidedTourSpotlightComponent } from '@components/guided-tour/guided-tour-spotlight.component';
import {
  GuidedTourConfig,
  GuidedTourEndReason,
  GuidedTourPlacement,
  GuidedTourStep,
} from '@models/guided-tour';
import { AnalyticsService } from '@services/analytics.service';

/** Space between the target and the spotlight edge. */
export const GUIDED_TOUR_SPOTLIGHT_PADDING = 8;
/** Space between the spotlight edge and the callout card. */
const CARD_OFFSET = 12;
/** Longest we wait for a smooth scroll to settle before showing a step. */
const SCROLL_SETTLE_MS = 500;
/** A target closer than this to the viewport edge is scrolled into view. */
const VISIBLE_MARGIN = 24;
/**
 * How long to keep looking for a step's target before skipping the step,
 * so targets that animate in (e.g. an expanding table row) aren't missed.
 */
const TARGET_WAIT_MS = 600;

const GAP = GUIDED_TOUR_SPOTLIGHT_PADDING + CARD_OFFSET;
const POSITIONS: Record<GuidedTourPlacement, ConnectedPosition> = {
  bottom: {
    originX: 'center',
    originY: 'bottom',
    overlayX: 'center',
    overlayY: 'top',
    offsetY: GAP,
  },
  top: {
    originX: 'center',
    originY: 'top',
    overlayX: 'center',
    overlayY: 'bottom',
    offsetY: -GAP,
  },
  right: {
    originX: 'end',
    originY: 'center',
    overlayX: 'start',
    overlayY: 'center',
    offsetX: GAP,
  },
  left: {
    originX: 'start',
    originY: 'center',
    overlayX: 'end',
    overlayY: 'center',
    offsetX: -GAP,
  },
};
const FALLBACK_ORDER: Record<GuidedTourPlacement, GuidedTourPlacement[]> = {
  bottom: ['bottom', 'top', 'right', 'left'],
  top: ['top', 'bottom', 'right', 'left'],
  right: ['right', 'left', 'bottom', 'top'],
  left: ['left', 'right', 'bottom', 'top'],
};
// Tried last: below or above, lined up with the target's edge instead of
// centered. A target at the edge of a narrow screen (e.g. a table's last
// column on a phone) fits none of the centered or side positions, and CDK
// would otherwise push the least-bad one on-screen, over the target.
const EDGE_ALIGNED_FALLBACKS: ConnectedPosition[] = [
  { ...POSITIONS.bottom, originX: 'end', overlayX: 'end' },
  { ...POSITIONS.bottom, originX: 'start', overlayX: 'start' },
  { ...POSITIONS.top, originX: 'end', overlayX: 'end' },
  { ...POSITIONS.top, originX: 'start', overlayX: 'start' },
];

/**
 * Runs a guided tour: a dimmed backdrop with a spotlight cut out around the
 * step's target, plus a callout card anchored beside it. The backdrop covers
 * the page, so only the tour (via each step's beforeShow) changes anything
 * while it runs.
 *
 * Targets are elements marked with `data-tour-anchor="<name>"`.
 */
@Injectable({ providedIn: 'root' })
export class GuidedTourService {
  protected readonly overlay = inject(Overlay);
  protected readonly appRef = inject(ApplicationRef);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly document = inject(DOCUMENT);

  readonly active = signal(false);
  readonly step = signal<GuidedTourStep | null>(null);
  /** Bounding box of the current step's targets; null for a centered step. */
  readonly targetRect = signal<DOMRect | null>(null);
  /** 1-based position among the steps that will show. */
  readonly stepNumber = signal(0);
  readonly stepCount = signal(0);
  readonly hasFullHelp = signal(false);
  readonly isFirst = computed(() => this.stepNumber() <= 1);
  readonly isLast = computed(() => this.stepNumber() >= this.stepCount());

  #config: GuidedTourConfig | null = null;
  #index = -1;
  /** Indices of the steps whose `when` passed at start; drives "N of M". */
  #plannedSteps: number[] = [];
  #busy = false;
  #targets: Element[] = [];
  #returnFocus: HTMLElement | null = null;

  #spotlightRef: OverlayRef | null = null;
  #cardRef: OverlayRef | null = null;
  #cardStrategy: FlexibleConnectedPositionStrategy | null = null;

  #resizeObserver: ResizeObserver | null = null;
  #frame = 0;

  readonly #onScrollOrResize = () => this.#scheduleReposition();
  readonly #onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      // Ends only the tour: a dialog the tour opened must not also react to
      // this Esc (the page's onEnd closes it)
      event.preventDefault();
      event.stopPropagation();
      this.stop('closed');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prev();
    }
  };

  async start(config: GuidedTourConfig): Promise<void> {
    if (this.active()) this.stop('closed');

    this.#config = config;
    this.#plannedSteps = config.steps
      .map((step, i) => (step.when?.() === false ? -1 : i))
      .filter((i) => i >= 0);
    this.stepCount.set(this.#plannedSteps.length);
    this.hasFullHelp.set(!!config.fullHelp);
    this.#returnFocus = this.document.activeElement as HTMLElement | null;
    this.active.set(true);
    this.#listen();
    this.analytics.logEvent('guided_tour_started', { tour_id: config.id });

    await this.#goTo(0, 1);
  }

  next(): Promise<void> {
    if (this.isLast()) {
      this.stop('completed');
      return Promise.resolve();
    }
    return this.#goTo(this.#index + 1, 1);
  }

  prev(): Promise<void> {
    return this.#goTo(this.#index - 1, -1);
  }

  /** Ends the tour (if running); onEnd always runs exactly once per tour. */
  stop(reason: GuidedTourEndReason): void {
    const config = this.#config;
    if (!config) return;

    this.analytics.logEvent(
      reason === 'completed' ? 'guided_tour_completed' : 'guided_tour_closed',
      { tour_id: config.id, step_id: this.step()?.id, index: this.#index }
    );
    this.#teardown();
    config.onEnd?.(reason);

    const focusTarget = this.#returnFocus;
    this.#returnFocus = null;
    if (focusTarget?.isConnected) focusTarget.focus();
  }

  /** "Read full help" on the last step: end the tour, then open the help. */
  openFullHelp(): void {
    const config = this.#config;
    if (!config?.fullHelp) return;
    this.analytics.logEvent('guided_tour_full_help_opened', {
      tour_id: config.id,
    });
    this.stop('completed');
    config.fullHelp();
  }

  async #goTo(start: number, direction: 1 | -1): Promise<void> {
    const config = this.#config;
    if (!config || this.#busy) return;
    this.#busy = true;
    try {
      for (let i = start; i >= 0 && i < config.steps.length; i += direction) {
        const step = config.steps[i]!;
        if (step.when?.() === false) continue;

        await step.beforeShow?.();
        if (this.#config !== config) return; // stopped mid-step
        // Render whatever beforeShow changed before measuring targets
        this.appRef.tick();
        this.#raiseOverlays();

        const targets = await this.#waitForTargets(step);
        if (this.#config !== config) return;
        if (step.target && targets.length === 0) continue;

        await this.#scrollIntoView(targets[0]);
        if (this.#config !== config) return;
        this.#show(i, step, targets);
        return;
      }
      // Walked off the end going forward: nothing left to show
      if (direction === 1) this.stop('completed');
    } finally {
      this.#busy = false;
    }
  }

  #resolveTargets(step: GuidedTourStep): Element[] {
    if (!step.target) return [];
    const names = Array.isArray(step.target) ? step.target : [step.target];
    return names
      .map((name) =>
        this.document.querySelector(`[data-tour-anchor="${name}"]`)
      )
      .filter((el): el is Element => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
  }

  /** Resolves the step's targets, waiting briefly for any still animating in. */
  async #waitForTargets(step: GuidedTourStep): Promise<Element[]> {
    let targets = this.#resolveTargets(step);
    if (!step.target || targets.length > 0) return targets;
    const deadline = Date.now() + TARGET_WAIT_MS;
    while (targets.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      targets = this.#resolveTargets(step);
    }
    return targets;
  }

  async #scrollIntoView(target: Element | undefined): Promise<void> {
    if (!target) return;
    const view = this.document.defaultView;
    const rect = target.getBoundingClientRect();
    const viewportHeight = view?.innerHeight ?? 0;
    if (
      rect.top >= VISIBLE_MARGIN &&
      rect.bottom <= viewportHeight - VISIBLE_MARGIN
    ) {
      return;
    }

    const reduceMotion = view?.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    target.scrollIntoView({
      block: 'center',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    if (reduceMotion) return;

    // scrollend doesn't bubble, but a capture listener still sees it from
    // #outlet (the page's real scroller)
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.document.removeEventListener('scrollend', done, true);
        resolve();
      };
      const timer = setTimeout(done, SCROLL_SETTLE_MS);
      this.document.addEventListener('scrollend', done, true);
    });
  }

  #show(index: number, step: GuidedTourStep, targets: Element[]): void {
    this.#index = index;
    this.#targets = targets;
    this.step.set(step);
    const planned = this.#plannedSteps.indexOf(index);
    this.stepNumber.set(planned >= 0 ? planned + 1 : this.stepNumber());

    this.#resizeObserver?.disconnect();
    targets.forEach((el) => this.#resizeObserver?.observe(el));

    const rect = this.#unionRect(targets);
    this.targetRect.set(rect);
    this.#ensureOverlays();
    this.#positionCard(step, rect);
    this.appRef.tick();
    this.#focusCard();

    this.analytics.logEvent('guided_tour_step_viewed', {
      tour_id: this.#config?.id,
      step_id: step.id,
      index,
    });
  }

  #ensureOverlays(): void {
    if (!this.#spotlightRef) {
      // Created first so the card (also in the top layer) stacks above it
      this.#spotlightRef = this.overlay.create({
        positionStrategy: this.overlay.position().global().top('0').left('0'),
        width: '100vw',
        height: '100vh',
        panelClass: 'guided-tour-spotlight-pane',
      });
      this.#spotlightRef.attach(
        new ComponentPortal(GuidedTourSpotlightComponent)
      );
    }
    if (!this.#cardRef) {
      this.#cardRef = this.overlay.create({
        panelClass: 'guided-tour-card-pane',
      });
      this.#cardRef.attach(new ComponentPortal(GuidedTourCardComponent));
    }
  }

  #positionCard(step: GuidedTourStep, rect: DOMRect | null): void {
    if (!this.#cardRef) return;
    if (!rect) {
      this.#cardStrategy = null;
      this.#cardRef.updatePositionStrategy(
        this.overlay.position().global().centerHorizontally().centerVertically()
      );
      return;
    }
    this.#cardStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.#origin(rect))
      .withPositions([
        ...FALLBACK_ORDER[step.placement ?? 'bottom'].map((p) => POSITIONS[p]),
        ...EDGE_ALIGNED_FALLBACKS,
      ])
      .withFlexibleDimensions(false)
      .withPush(true)
      .withViewportMargin(16);
    this.#cardRef.updatePositionStrategy(this.#cardStrategy);
  }

  #origin(rect: DOMRect) {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }

  #unionRect(targets: Element[]): DOMRect | null {
    if (targets.length === 0) return null;
    const rects = targets.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
  }

  /**
   * Overlays render in the browser's top layer, stacked in the order they
   * were shown, so a dialog a step opens would cover the spotlight and card.
   * Re-showing them moves them back on top (spotlight first, then card).
   */
  #raiseOverlays(): void {
    for (const ref of [this.#spotlightRef, this.#cardRef]) {
      const host = ref?.hostElement;
      if (!host?.hasAttribute('popover') || !('showPopover' in host)) continue;
      try {
        host.hidePopover();
        host.showPopover();
      } catch {
        // Not currently open (nothing to raise)
      }
    }
  }

  /** Keeps keyboard focus inside the card (e.g. after Back disappears). */
  #focusCard(): void {
    const card = this.#cardRef?.overlayElement;
    if (!card || card.contains(this.document.activeElement)) return;
    card.querySelector<HTMLElement>('[data-guided-tour-primary]')?.focus();
  }

  #scheduleReposition(): void {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      if (!this.active() || this.#targets.length === 0) return;
      const rect = this.#unionRect(this.#targets);
      this.targetRect.set(rect);
      if (rect && this.#cardStrategy) {
        this.#cardStrategy.setOrigin(this.#origin(rect));
        this.#cardRef?.updatePosition();
      }
    });
  }

  #listen(): void {
    const view = this.document.defaultView;
    // Capture phase: the page scrolls inside #outlet, whose scroll events
    // don't bubble to document (and the CDK's ScrollDispatcher misses them)
    this.document.addEventListener('scroll', this.#onScrollOrResize, true);
    view?.addEventListener('resize', this.#onScrollOrResize);
    this.document.addEventListener('keydown', this.#onKeydown, true);
    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(this.#onScrollOrResize);
    }
  }

  #teardown(): void {
    const view = this.document.defaultView;
    this.document.removeEventListener('scroll', this.#onScrollOrResize, true);
    view?.removeEventListener('resize', this.#onScrollOrResize);
    this.document.removeEventListener('keydown', this.#onKeydown, true);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    if (this.#frame) cancelAnimationFrame(this.#frame);
    this.#frame = 0;

    this.#cardRef?.dispose();
    this.#spotlightRef?.dispose();
    this.#cardRef = null;
    this.#spotlightRef = null;
    this.#cardStrategy = null;

    this.#config = null;
    this.#index = -1;
    this.#plannedSteps = [];
    this.#targets = [];
    this.active.set(false);
    this.step.set(null);
    this.targetRect.set(null);
    this.stepNumber.set(0);
    this.stepCount.set(0);
    this.hasFullHelp.set(false);
  }
}
