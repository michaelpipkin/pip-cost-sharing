import { describe, expect, it } from 'vitest';
import {
  FEATURE_TOUR_SLIDES,
  featureTourImagePath,
} from './feature-tour-slides';

describe('feature tour slides', () => {
  describe('featureTourImagePath', () => {
    it('should build the desktop screenshot path from the slide id', () => {
      expect(
        featureTourImagePath(
          { id: 'expenses', title: 't', text: 'x', alt: 'a' },
          'desktop'
        )
      ).toBe('/assets/images/feature-tour/expenses-desktop.png');
    });

    it('should build the mobile screenshot path from the slide id', () => {
      expect(
        featureTourImagePath(
          { id: 'settle-up', title: 't', text: 'x', alt: 'a' },
          'mobile'
        )
      ).toBe('/assets/images/feature-tour/settle-up-mobile.png');
    });
  });

  describe('FEATURE_TOUR_SLIDES', () => {
    it('should have at least one slide', () => {
      expect(FEATURE_TOUR_SLIDES.length).toBeGreaterThan(0);
    });

    it('should have unique ids', () => {
      const ids = FEATURE_TOUR_SLIDES.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have ids that are safe in an image file name', () => {
      for (const slide of FEATURE_TOUR_SLIDES) {
        expect(slide.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }
    });

    it.each(FEATURE_TOUR_SLIDES.map((s) => [s.id, s] as const))(
      'slide %s should have a non-blank title, text and alt',
      (_id, slide) => {
        expect(slide.title.trim()).not.toBe('');
        expect(slide.text.trim()).not.toBe('');
        expect(slide.alt.trim()).not.toBe('');
      }
    );
  });
});
