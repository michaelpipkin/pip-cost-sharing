import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DefaultButtonDirective } from './default-button.directive';

/**
 * A form whose Save button sits outside it (linked by the form attribute), the
 * way the expense pages lay theirs out. The amount field re-allocates on blur
 * and Save stays disabled until it has, so a test can tell whether Enter ran
 * the blur-time work before saving. Between the amount and the category
 * dropdown sit things Enter's move to the next field must skip.
 */
@Component({
  imports: [DefaultButtonDirective],
  template: `
    <form id="test-form" (submit)="$event.preventDefault()">
      <input id="amount" type="text" (blur)="allocate()" />
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
      <div id="category" role="combobox" tabindex="0"></div>
      <textarea id="notes"></textarea>
      <input id="last" type="text" />
    </form>
    <button
      id="save"
      type="submit"
      form="test-form"
      defaultButton
      [disabled]="!allocated()"
      (click)="saves.push(allocated())"
    >
      Save
    </button>
  `,
})
class HostComponent {
  readonly allocated = signal(false);
  allocationBlocked = false;
  saves: boolean[] = [];
  calculatorClicks = 0;

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

  it('saves on Enter in a text field, after the blur-time work has run', () => {
    const event = pressEnter(field('amount'));

    expect(host.saves).toEqual([true]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('moves to the next field you can type in or choose from when Save is still disabled, like Tab', () => {
    host.allocationBlocked = true;

    pressEnter(field('amount'));

    expect(host.saves).toEqual([]);
    // Past the checkbox, the button and the disabled, read-only, untabbable
    // and hidden fields, to the dropdown.
    expect(document.activeElement).toBe(field('category'));
  });

  it('moves on to a text area too', () => {
    host.allocationBlocked = true;
    field('category').setAttribute('aria-disabled', 'true');

    pressEnter(field('amount'));

    expect(document.activeElement).toBe(field('notes'));
  });

  it('stays in the last field when there is no next one', () => {
    pressEnter(field('last'));

    expect(host.saves).toEqual([]);
    expect(document.activeElement).toBe(field('last'));
  });

  it('leaves Enter alone in a textarea (new line)', () => {
    host.allocated.set(true);
    fixture.detectChanges();

    const event = pressEnter(field('notes'));

    expect(host.saves).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves Enter alone on other buttons and toggles in the form', () => {
    host.allocated.set(true);
    fixture.detectChanges();

    pressEnter(field('calculator'));
    pressEnter(field('agree'));

    expect(host.saves).toEqual([]);
  });

  it.each([
    ['Shift', { shiftKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Cmd', { metaKey: true }],
    ['an IME composition', { isComposing: true }],
  ])('leaves Enter alone with %s', (_label, init) => {
    host.allocated.set(true);
    fixture.detectChanges();

    pressEnter(field('amount'), init);

    expect(host.saves).toEqual([]);
  });

  it('leaves Enter alone when the field shows an open popup (e.g. autocomplete)', () => {
    host.allocated.set(true);
    fixture.detectChanges();
    field('amount').setAttribute('aria-expanded', 'true');

    pressEnter(field('amount'));

    expect(host.saves).toEqual([]);
  });

  it('ignores other keys', () => {
    host.allocated.set(true);
    fixture.detectChanges();

    pressEnter(field('amount'), { key: 'a' });

    expect(host.saves).toEqual([]);
  });

  it('stops listening once destroyed', () => {
    const form = el.querySelector('form')!;
    const removeSpy = vi.spyOn(form, 'removeEventListener');

    fixture.destroy();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
