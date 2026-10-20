import {
  afterNextRender,
  ApplicationRef,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
} from '@angular/core';

// Single-line input types: Enter in one of these moves on rather than doing
// something to the field itself (checkboxes, radios, files, etc. are left out).
const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

// Where Enter moves to: fields you type in or choose from. Buttons,
// checkboxes and toggles are skipped - Enter on one of those would press or
// flip it - except this directive's own button, the last stop.
const FIELD_SELECTOR = 'input, textarea, select, [role="combobox"]';

/**
 * Makes Enter in the form move forward like Tab, ending on this button (the
 * form's Save button): Enter never saves from a field, and saves only when the
 * Save button itself has focus (the browser's normal button behaviour). On
 * these forms a valid form is often not a finished one - splits are prefilled
 * evenly and then adjusted - so Enter must not submit early.
 *
 * The button must belong to the form: inside it, or outside it linked by the
 * standard `form="<form id>"` attribute.
 *
 * Enter in a single-line field, or on a closed dropdown (Space still opens
 * it), moves to the next field you can type in or choose from, skipping
 * buttons, toggles and disabled, read-only and hidden fields. After the last
 * one it moves to this button, if it's enabled once the field's blur-time
 * work (currency formatting, split re-allocation) has run; otherwise the
 * cursor stays put.
 *
 * Enter is left alone in text areas (new line), on buttons and toggles, with a
 * modifier key held, during IME composition, and while a field's popup is
 * open (an open dropdown or autocomplete list uses Enter to pick an option).
 *
 * On Android the keyboard's own "next field" key (->|) already moves focus
 * forward without sending Enter; on the last field it shows Go/Done, which
 * sends Enter and lands here.
 */
@Directive({
  selector: 'button[defaultButton]',
})
export class DefaultButtonDirective {
  readonly #button =
    inject<ElementRef<HTMLButtonElement>>(ElementRef).nativeElement;
  readonly #appRef = inject(ApplicationRef);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // The form attribute links the button to its form only once both are in
    // the DOM.
    afterNextRender(() => {
      const form = this.#button.form;
      if (!form) return;
      const onKeydown = (event: KeyboardEvent) => this.#onKeydown(event, form);
      // Capture phase: a dropdown opens itself on Enter in its own handler,
      // which runs before a bubbling listener could stop it.
      form.addEventListener('keydown', onKeydown, true);
      destroyRef.onDestroy(() =>
        form.removeEventListener('keydown', onKeydown, true)
      );
    });
  }

  #onKeydown(event: KeyboardEvent, form: HTMLFormElement): void {
    if (
      event.key !== 'Enter' ||
      event.defaultPrevented ||
      event.isComposing ||
      event.shiftKey ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    ) {
      return;
    }
    const field = event.target;
    if (
      !(field instanceof HTMLElement) ||
      !this.#isField(field) ||
      field.getAttribute('aria-expanded') === 'true'
    ) {
      return;
    }

    // Replaces the browser's own Enter-to-submit and a dropdown's open-on-Enter
    event.preventDefault();
    event.stopPropagation();
    // Run the field's blur-time work first, and bring the button's disabled
    // state up to date, before deciding whether the button is the next stop.
    field.blur();
    this.#appRef.tick();
    this.#nextStop(form, field).focus();
  }

  #isField(element: HTMLElement): boolean {
    if (element instanceof HTMLInputElement) {
      return TEXT_INPUT_TYPES.has(element.type);
    }
    return (
      element instanceof HTMLSelectElement ||
      element.getAttribute('role') === 'combobox'
    );
  }

  /**
   * The next field after `field` that Enter can move to; after the last one,
   * this button if it's enabled; otherwise `field` itself.
   */
  #nextStop(form: HTMLFormElement, field: HTMLElement): HTMLElement {
    const fields = Array.from(
      form.querySelectorAll<HTMLElement>(FIELD_SELECTOR)
    );
    const next = fields
      .slice(fields.indexOf(field) + 1)
      .find((candidate) => this.#canMoveTo(candidate));
    if (next) return next;
    return this.#button.disabled ? field : this.#button;
  }

  #canMoveTo(candidate: HTMLElement): boolean {
    if (
      candidate instanceof HTMLInputElement &&
      !TEXT_INPUT_TYPES.has(candidate.type)
    ) {
      return false; // checkboxes, radios, file inputs, ...
    }
    if (
      candidate.matches(':disabled') ||
      (candidate as HTMLInputElement).readOnly ||
      candidate.getAttribute('aria-disabled') === 'true' ||
      candidate.tabIndex < 0 ||
      candidate.closest('[hidden], [inert]')
    ) {
      return false;
    }
    // Not displayed (e.g. display: none). checkVisibility() is missing from
    // jsdom, where nothing is laid out anyway.
    return typeof candidate.checkVisibility === 'function'
      ? candidate.checkVisibility()
      : true;
  }
}
