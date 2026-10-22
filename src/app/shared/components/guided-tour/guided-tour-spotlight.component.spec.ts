import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  GUIDED_TOUR_SPOTLIGHT_PADDING,
  GuidedTourService,
} from '@services/guided-tour.service';
import { beforeEach, describe, expect, it } from 'vitest';
import { GuidedTourSpotlightComponent } from './guided-tour-spotlight.component';

describe('GuidedTourSpotlightComponent', () => {
  let fixture: ComponentFixture<GuidedTourSpotlightComponent>;
  let targetRect: ReturnType<typeof signal<DOMRect | null>>;

  function hole(): HTMLElement {
    return fixture.nativeElement.querySelector('.guided-tour-hole');
  }

  beforeEach(() => {
    targetRect = signal<DOMRect | null>(null);
    TestBed.configureTestingModule({
      imports: [GuidedTourSpotlightComponent],
      providers: [{ provide: GuidedTourService, useValue: { targetRect } }],
    });
    fixture = TestBed.createComponent(GuidedTourSpotlightComponent);
    fixture.detectChanges();
  });

  it('should use the documented padding of 8px', () => {
    expect(GUIDED_TOUR_SPOTLIGHT_PADDING).toBe(8);
  });

  it('should have no hole and carry the no-target class when there is no rect', () => {
    expect(hole().classList.contains('no-target')).toBe(true);
    expect(hole().style.top).toBe('');
    expect(hole().style.left).toBe('');
    expect(hole().style.width).toBe('0px');
    expect(hole().style.height).toBe('0px');
  });

  it('should pad the target rect on every side and drop the no-target class', async () => {
    targetRect.set(new DOMRect(100, 100, 120, 40));
    await fixture.whenStable();

    expect(hole().classList.contains('no-target')).toBe(false);
    expect(hole().style.top).toBe('92px');
    expect(hole().style.left).toBe('92px');
    expect(hole().style.width).toBe('136px');
    expect(hole().style.height).toBe('56px');
  });

  it('should follow the rect as it changes and fall back to no hole when it clears', async () => {
    targetRect.set(new DOMRect(100, 100, 120, 40));
    await fixture.whenStable();
    targetRect.set(new DOMRect(10, 20, 30, 40));
    await fixture.whenStable();

    expect(hole().style.top).toBe('12px');
    expect(hole().style.left).toBe('2px');
    expect(hole().style.width).toBe('46px');
    expect(hole().style.height).toBe('56px');

    targetRect.set(null);
    await fixture.whenStable();

    expect(hole().classList.contains('no-target')).toBe(true);
    expect(hole().style.width).toBe('0px');
  });

  it('should hide the layer from assistive technology', () => {
    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');
  });
});
