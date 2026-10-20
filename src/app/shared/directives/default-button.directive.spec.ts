import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DefaultButtonDirective } from './default-button.directive';

/**
 * A form whose Save button sits outside it (linked by the form attribute), the
 * way the expense pages lay theirs out. The last field re-allocates on blur
 * and Save stays disabled until it has, so a test can tell whether Enter ran
 * the blur-time work before moving to Save. Between the amount and the
 * category dropdown sit things Enter must skip. The dropdown opens itself on
 * Enter (as mat-select does) unless the directive stops it.
 */
@Component({
  imports: [DefaultButtonDirective],
  template: `
    <form id="test-form" (submit)="$event.preventDefault()">
      <input id="amount" type="text" />
      <input id="agree" type="checkbox" />
      <button
        id="calculator"
        type="button"
        (click)="calculatorClicks = calculatorClicks + 1"
      >
        Calc
      </button>
      <input id="locked" type="text" disabled />
      <input id="read-only" type="text" readonly />
      <input id="untabbable" type="text" tabindex="-1" />
      <div hidden><input id="hidden" type="text" /></div>
      <div
        id="category"
        role="combobox"
        tabindex="0"
        (keydown.enter)="dropdownOpens = dropdownOpens + 1"
      ></div>
      <textarea id="notes"></textarea>
      <input id="last" type="text" (blur)="allocate()" />
    </form>
    <button
      id="save"
      type="submit"
      form="test-form"
      defaultButton
      [disabled]="!allocated()"
      (click)="saves = saves + 1"
    >
      Save
    </button>
  `,
})
class HostComponent {
  readonly allocated = signal(false);
  allocationBlocked = false;
  saves = 0;
  calculatorClicks = 0;
  dropdownOpens = 0;

  allocate(): void {
    if (!this.allocationBlocked) this.allocated.set(true);
  }
}

describe('DefaultButtonDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
    document.body.appendChild(el);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    el.remove();
  });

  const field = (id: string) => el.querySelector<HTMLElement>(`#${id}`)!;

  function pressEnter(
    target: HTMLElement,
    init: KeyboardEventInit = {}
  ): KeyboardEvent {
    target.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  }

  /** A form that could be saved right now. */
  function makeSaveable(): void {
    host.allocated.set(true);
    fixture.detectChanges();
  }

  it('moves to the next field like Tab, and never saves from a field, even when the form could be saved', () => {
    makeSaveable();

    const event = pressEnter(field('amount'));

    expect(host.saves).toBe(0);
    expect(event.defaultPrevented).toBe(true);
    // Past the checkbox, the button and the disabled, read-only, untabbable
    // and hidden fields, to the dropdown.
    expect(document.activeElement).toBe(field('category'));
  });

  it('moves on from a closed dropdown instead of opening it', () => {
    pressEnter(field('category'));

    expect(host.dropdownOpens).toBe(0);
    expect(document.activeElement).toBe(field('notes'));
  });

  it('leaves Enter to an open dropdown, which uses it to pick an option', () => {
    field('category').setAttribute('aria-expanded', 'true');

    pressEnter(field('category'));

    expect(host.dropdownOpens).toBe(1);
    expect(document.activeElement).toBe(field('category'));
  });

  it('moves from the last field to Save once its blur-time work has enabled Save', () => {
    pressEnter(field('last'));

    expect(document.activeElement).toBe(field('save'));
    expect(host.saves).toBe(0);
  });

  it('stays in the last field when Save is still disabled after it', () => {
    host.allocationBlocked = true;

    pressEnter(field('last'));

    expect(document.activeElement).toBe(field('last'));
    expect(host.saves).toBe(0);
  });

  it('leaves Enter alone in a textarea (new line)', () => {
    const event = pressEnter(field('notes'));

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(field('notes'));
  });

  it('leaves Enter alone on buttons and toggles in the form', () => {
    expect(pressEnter(field('calculator')).defaultPrevented).toBe(false);
    expect(pressEnter(field('agree')).defaultPrevented).toBe(false);
  });

  it.each([
    ['Shift', { shiftKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Cmd', { metaKey: true }],
    ['an IME composition', { isComposing: true }],
  ])('leaves Enter alone with %s', (_label, init) => {
    const event = pressEnter(field('amount'), init);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(field('amount'));
  });

  it('leaves Enter alone when a text field shows an open popup (e.g. autocomplete)', () => {
    field('amount').setAttribute('aria-expanded', 'true');

    const event = pressEnter(field('amount'));

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(field('amount'));
  });

  it('ignores other keys', () => {
    const event = pressEnter(field('amount'), { key: 'a' });

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(field('amount'));
  });

  it('stops listening once destroyed', () => {
    const form = el.querySelector('form')!;
    const removeSpy = vi.spyOn(form, 'removeEventListener');

    fixture.destroy();

    expect(removeSpy).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
      true
    );
  });
});
