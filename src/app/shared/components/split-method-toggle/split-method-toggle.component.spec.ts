import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonToggle } from '@angular/material/button-toggle';
import { By } from '@angular/platform-browser';
import { SplitMethod } from '@utils/split-method';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SplitMethodToggleComponent } from './split-method-toggle.component';

describe('SplitMethodToggleComponent', () => {
  let fixture: ComponentFixture<SplitMethodToggleComponent>;
  let component: SplitMethodToggleComponent;

  const toggles = (): MatButtonToggle[] =>
    fixture.debugElement
      .queryAll(By.directive(MatButtonToggle))
      .map((d) => d.componentInstance as MatButtonToggle);

  const toggleButton = (testId: string): HTMLButtonElement =>
    fixture.nativeElement.querySelector(
      `[data-testid="${testId}"] button`
    ) as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SplitMethodToggleComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SplitMethodToggleComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should default to the amount split method with Amount checked', () => {
    expect(component.splitMethod()).toBe('amount');
    expect(toggles().map((t) => [t.value, t.checked])).toEqual([
      ['amount', true],
      ['percentage', false],
      ['shares', false],
    ]);
  });

  it('should set the model and emit once when Shares is clicked', async () => {
    let count = 0;
    const emitted: SplitMethod[] = [];
    component.methodChanged.subscribe((m) => {
      count++;
      emitted.push(m);
    });

    toggleButton('split-by-shares-toggle').click();
    await fixture.whenStable();

    expect(component.splitMethod()).toBe('shares');
    expect(count).toBe(1);
    expect(emitted).toEqual(['shares']);
  });

  it('should set the model and emit once when % is clicked', async () => {
    const emitted: SplitMethod[] = [];
    component.methodChanged.subscribe((m) => emitted.push(m));

    toggleButton('split-by-percentage-toggle').click();
    await fixture.whenStable();

    expect(component.splitMethod()).toBe('percentage');
    expect(emitted).toEqual(['percentage']);
  });

  it('should reflect a method set from outside in the checked toggle', async () => {
    component.splitMethod.set('shares');
    await fixture.whenStable();
    expect(
      toggles()
        .filter((t) => t.checked)
        .map((t) => t.value)
    ).toEqual(['shares']);
  });
});
