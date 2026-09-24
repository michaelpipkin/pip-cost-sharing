import { FlexibleConnectedPositionStrategy } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { GuidedTourConfig, GuidedTourStep } from '@models/guided-tour';
import { AnalyticsService } from '@services/analytics.service';
import { createMockAnalyticsService } from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidedTourService } from './guided-tour.service';

describe('GuidedTourService', () => {
  let service: GuidedTourService;
  let analytics: ReturnType<typeof createMockAnalyticsService>;
  let anchors: HTMLElement[];

  /**
   * On-screen element marked as a tour anchor. The specs run in jsdom, which
   * does no layout, so the element's box is stubbed (the service skips
   * zero-size targets as hidden).
   */
  function addAnchor(name: string, top = 100): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-tour-anchor', name);
    el.getBoundingClientRect = () => new DOMRect(100, top, 120, 40);
    document.body.appendChild(el);
    anchors.push(el);
    return el;
  }

  const card = () =>
    document.querySelector<HTMLElement>('[data-testid="guided-tour-card"]');
  const byTestId = (id: string) =>
    document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const title = () => byTestId('guided-tour-title')?.textContent?.trim();

  function config(
    steps: GuidedTourStep[],
    extra: Partial<GuidedTourConfig> = {}
  ): GuidedTourConfig {
    return { id: 'test-tour', steps, ...extra };
  }

  const steps: GuidedTourStep[] = [
    { id: 'one', title: 'One', text: 'First', target: 'a' },
    { id: 'two', title: 'Two', text: 'Second', target: 'b' },
    { id: 'three', title: 'Three', text: 'Third' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    anchors = [];
    analytics = createMockAnalyticsService();
    TestBed.configureTestingModule({
      providers: [{ provide: AnalyticsService, useValue: analytics }],
    });
    service = TestBed.inject(GuidedTourService);
    addAnchor('a', 100);
    addAnchor('b', 200);
  });

  afterEach(() => {
    service.stop('closed');
    anchors.forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  describe('starting', () => {
    it('should show the first step with its card and spotlight', async () => {
      await service.start(config(steps));

      expect(service.active()).toBe(true);
      expect(card()).toBeTruthy();
      expect(byTestId('guided-tour-spotlight')).toBeTruthy();
      expect(title()).toBe('One');
      expect(byTestId('guided-tour-count')?.textContent?.trim()).toBe('1 of 3');
      expect(service.targetRect()?.top).toBe(100);
    });

    it('should leave out steps whose when() is false from the count', async () => {
      await service.start(
        config([steps[0]!, { ...steps[1]!, when: () => false }, steps[2]!])
      );

      expect(service.stepCount()).toBe(2);
      await service.next();
      expect(title()).toBe('Three');
      expect(service.stepNumber()).toBe(2);
    });

    it('should wait briefly for a target that appears after beforeShow', async () => {
      // e.g. a table row whose detail animates open
      const late = {
        ...steps[1]!,
        target: 'late',
        beforeShow: () => {
          setTimeout(() => addAnchor('late', 300), 100);
        },
      };
      await service.start(config([steps[0]!, late, steps[2]!]));
      await service.next();

      expect(title()).toBe('Two');
    });

    it('should skip a step whose target is missing', async () => {
      await service.start(
        config([steps[0]!, { ...steps[1]!, target: 'missing' }, steps[2]!])
      );
      await service.next();

      expect(title()).toBe('Three');
    });

    it('should center a step with no target (no spotlight hole)', async () => {
      await service.start(config([steps[2]!]));

      expect(service.targetRect()).toBeNull();
      expect(
        document.querySelector('.guided-tour-hole.no-target')
      ).toBeTruthy();
    });

    it('should try the preferred side first, then edge-aligned positions last', async () => {
      const withPositions = vi.spyOn(
        FlexibleConnectedPositionStrategy.prototype,
        'withPositions'
      );
      await service.start(config([{ ...steps[0]!, placement: 'left' }]));

      const positions = withPositions.mock.lastCall![0];
      expect(positions[0]).toMatchObject({ originX: 'start', overlayX: 'end' });
      // A target at the edge of a narrow screen still gets a spot below it
      // lined up with its edge, rather than a card pushed over it
      expect(positions.slice(-4)).toEqual([
        expect.objectContaining({
          originY: 'bottom',
          originX: 'end',
          overlayX: 'end',
        }),
        expect.objectContaining({
          originY: 'bottom',
          originX: 'start',
          overlayX: 'start',
        }),
        expect.objectContaining({
          originY: 'top',
          originX: 'end',
          overlayX: 'end',
        }),
        expect.objectContaining({
          originY: 'top',
          originX: 'start',
          overlayX: 'start',
        }),
      ]);
    });

    it('should log guided_tour_started and the first step view', async () => {
      await service.start(config(steps));

      expect(analytics.logEvent).toHaveBeenCalledWith('guided_tour_started', {
        tour_id: 'test-tour',
      });
      expect(analytics.logEvent).toHaveBeenCalledWith(
        'guided_tour_step_viewed',
        { tour_id: 'test-tour', step_id: 'one', index: 0 }
      );
    });
  });

  describe('navigation', () => {
    it('should move forward and back', async () => {
      await service.start(config(steps));
      await service.next();
      expect(title()).toBe('Two');
      await service.prev();
      expect(title()).toBe('One');
    });

    it('should not go before the first step', async () => {
      await service.start(config(steps));
      await service.prev();
      expect(title()).toBe('One');
    });

    it('should await beforeShow before showing the step', async () => {
      let release!: () => void;
      const beforeShow = vi.fn(
        () => new Promise<void>((resolve) => (release = resolve))
      );
      await service.start(config([steps[0]!, { ...steps[1]!, beforeShow }]));

      const moving = service.next();
      await Promise.resolve();
      expect(beforeShow).toHaveBeenCalled();
      expect(title()).toBe('One');

      release();
      await moving;
      expect(title()).toBe('Two');
    });

    it('should show Back only after the first step', async () => {
      await service.start(config(steps));
      expect(byTestId('guided-tour-back-button')).toBeNull();
      await service.next();
      expect(byTestId('guided-tour-back-button')).toBeTruthy();
    });

    it('should navigate with the arrow keys', async () => {
      await service.start(config(steps));
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight' })
      );
      await vi.waitFor(() => expect(title()).toBe('Two'));
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft' })
      );
      await vi.waitFor(() => expect(title()).toBe('One'));
    });
  });

  describe('ending', () => {
    it('should turn Next into Done on the last step and complete on click', async () => {
      const onEnd = vi.fn();
      await service.start(config(steps, { onEnd }));
      await service.next();
      await service.next();

      const primary = byTestId('guided-tour-primary-button')!;
      expect(primary.textContent?.trim()).toBe('Done');
      primary.click();

      expect(onEnd).toHaveBeenCalledExactlyOnceWith('completed');
      expect(service.active()).toBe(false);
      expect(card()).toBeNull();
      expect(analytics.logEvent).toHaveBeenCalledWith('guided_tour_completed', {
        tour_id: 'test-tour',
        step_id: 'three',
        index: 2,
      });
    });

    it('should close on Escape', async () => {
      const onEnd = vi.fn();
      await service.start(config(steps, { onEnd }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(onEnd).toHaveBeenCalledExactlyOnceWith('closed');
      expect(card()).toBeNull();
    });

    it('should close from the X button', async () => {
      const onEnd = vi.fn();
      await service.start(config(steps, { onEnd }));
      byTestId('guided-tour-close-button')!.click();

      expect(onEnd).toHaveBeenCalledExactlyOnceWith('closed');
      expect(analytics.logEvent).toHaveBeenCalledWith('guided_tour_closed', {
        tour_id: 'test-tour',
        step_id: 'one',
        index: 0,
      });
    });

    it('should call onEnd only once however many times stop is called', async () => {
      const onEnd = vi.fn();
      await service.start(config(steps, { onEnd }));
      service.stop('closed');
      service.stop('closed');

      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('should end a running tour before starting another', async () => {
      const firstEnd = vi.fn();
      await service.start(config(steps, { onEnd: firstEnd }));
      await service.start(config(steps));

      expect(firstEnd).toHaveBeenCalledExactlyOnceWith('closed');
      expect(service.active()).toBe(true);
    });

    it('should return focus to the element that started the tour', async () => {
      const trigger = document.createElement('button');
      document.body.appendChild(trigger);
      trigger.focus();

      await service.start(config(steps));
      service.stop('closed');

      expect(document.activeElement).toBe(trigger);
      trigger.remove();
    });
  });

  describe('dialogs opened by a step', () => {
    it('should re-raise its overlays above a dialog a step opens', async () => {
      // jsdom has no popover API; stub it so the CDK renders the tour's
      // overlays as popovers (as browsers do) for the length of this test
      const proto = HTMLElement.prototype as any;
      const added = !('showPopover' in proto);
      if (added) {
        proto.showPopover = function () {};
        proto.hidePopover = function () {};
      }
      try {
        const show = vi.spyOn(proto, 'showPopover');
        await service.start(
          config([steps[0]!, { ...steps[1]!, beforeShow: () => {} }])
        );
        show.mockClear();

        await service.next();

        const hosts = show.mock.contexts as HTMLElement[];
        expect(hosts.some((h) => h.querySelector('app-guided-tour-card'))).toBe(
          true
        );
        expect(
          hosts.some((h) => h.querySelector('app-guided-tour-spotlight'))
        ).toBe(true);
      } finally {
        service.stop('closed');
        if (added) {
          delete proto.showPopover;
          delete proto.hidePopover;
        }
      }
    });

    it('should keep Esc from reaching anything else (e.g. an open dialog)', async () => {
      const bodyListener = vi.fn();
      document.body.addEventListener('keydown', bodyListener);
      await service.start(config(steps));

      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );

      expect(service.active()).toBe(false);
      expect(bodyListener).not.toHaveBeenCalled();
      document.body.removeEventListener('keydown', bodyListener);
    });
  });

  describe('full help', () => {
    it('should not offer Read full help without a fullHelp callback', async () => {
      await service.start(config([steps[2]!]));
      expect(byTestId('guided-tour-full-help-button')).toBeNull();
    });

    it('should end the tour, then open the full help', async () => {
      const calls: string[] = [];
      await service.start(
        config([steps[2]!], {
          onEnd: () => calls.push('end'),
          fullHelp: () => calls.push('help'),
        })
      );

      byTestId('guided-tour-full-help-button')!.click();

      expect(calls).toEqual(['end', 'help']);
      expect(analytics.logEvent).toHaveBeenCalledWith(
        'guided_tour_full_help_opened',
        { tour_id: 'test-tour' }
      );
    });
  });
});
