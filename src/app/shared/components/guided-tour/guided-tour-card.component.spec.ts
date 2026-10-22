import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GuidedTourStep } from '@models/guided-tour';
import { GuidedTourService } from '@services/guided-tour.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidedTourCardComponent } from './guided-tour-card.component';

describe('GuidedTourCardComponent', () => {
  let fixture: ComponentFixture<GuidedTourCardComponent>;
  let step: ReturnType<typeof signal<GuidedTourStep | null>>;
  let isLast: ReturnType<typeof signal<boolean>>;
  let tour: {
    step: typeof step;
    isFirst: ReturnType<typeof signal<boolean>>;
    isLast: typeof isLast;
    hasFullHelp: ReturnType<typeof signal<boolean>>;
    stepNumber: ReturnType<typeof signal<number>>;
    stepCount: ReturnType<typeof signal<number>>;
    next: ReturnType<typeof vi.fn>;
    prev: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    openFullHelp: ReturnType<typeof vi.fn>;
  };

  function card(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.guided-tour-card');
  }

  function primary(): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      '[data-testid="guided-tour-primary-button"]'
    );
  }

  beforeEach(() => {
    step = signal<GuidedTourStep | null>(null);
    isLast = signal(false);
    tour = {
      step,
      isFirst: signal(true),
      isLast,
      hasFullHelp: signal(false),
      stepNumber: signal(1),
      stepCount: signal(3),
      next: vi.fn(),
      prev: vi.fn(),
      stop: vi.fn(),
      openFullHelp: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [GuidedTourCardComponent],
      providers: [{ provide: GuidedTourService, useValue: tour }],
    });
    fixture = TestBed.createComponent(GuidedTourCardComponent);
    fixture.detectChanges();
  });

  it('should render nothing when there is no step', () => {
    expect(fixture.nativeElement.querySelector('.guided-tour-card')).toBeNull();
    expect(primary()).toBeNull();
  });

  it('should render the step title, text and position once a step is set', async () => {
    step.set({ id: 's1', title: 'Hello', text: 'Pick a thing' });
    await fixture.whenStable();

    expect(card()).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="guided-tour-title"]')
        .textContent
    ).toContain('Hello');
    expect(
      fixture.nativeElement.querySelector('[data-testid="guided-tour-text"]')
        .textContent
    ).toContain('Pick a thing');
    expect(
      fixture.nativeElement.querySelector('[data-testid="guided-tour-count"]')
        .textContent
    ).toContain('1 of 3');
  });

  it('should go to the next step when the primary button is clicked before the last step', async () => {
    step.set({ id: 's1', title: 'Hello', text: 'Pick a thing' });
    await fixture.whenStable();

    primary().click();

    expect(tour.next).toHaveBeenCalledTimes(1);
    expect(tour.stop).not.toHaveBeenCalled();
  });

  it('should complete the tour when the primary button is clicked on the last step', async () => {
    step.set({ id: 's3', title: 'Last', text: 'Finish up' });
    isLast.set(true);
    await fixture.whenStable();

    primary().click();

    expect(tour.stop).toHaveBeenCalledTimes(1);
    expect(tour.stop).toHaveBeenCalledWith('completed');
    expect(tour.next).not.toHaveBeenCalled();
  });
});
