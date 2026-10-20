import {
  afterNextRender,
  ApplicationRef,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
} from '@angular/core';

// Single-line input types where Enter means "submit" rather than doing
// something to the field itself (checkboxes, radios, files, etc. are left out).
const ENTER_SUBMITS_INPUT_TYPES = new Set([
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

// Where Enter moves to when the form can't be saved yet: fields you type in
// or choose from. Buttons, checkboxes and toggles are skipped - Enter on one
// of those would press or flip it.
const NEXT_FIELD_SELECTOR = 'input, textarea, select, [role="combobox"]';

/**
 * Makes Enter in one of the form's single-line fields save the form by
 * clicking this button - the form's "default button".
 *
 * The button must belong to the form: inside it, or outside it linked by the
 * standard `form="<form id>"` attribute. The browser's own Enter-to-submit
 * isn't enough on its own: it clicks the button before the field loses focus,
 * and several fields only format their value or re-allocate the splits on
 * blur. So on Enter this blurs the field first, brings the button's disabled
 * state up to date, and clicks it only if it is still enabled.
 *
 * If the form can't be saved yet, Enter moves on to the next field you can
 * type in or choose from (like Tab, but skipping buttons and toggles, and
 * disabled, read-only and hidden fields). In the last such field it stays put.
 *
 * Enter is left alone in text areas (new line), on buttons, selects and
 * toggles, with a modifier key held, during IME composition, and while the
 * field has an open popup such as an autocomplete list.
 *
 * On-screen keyboards: Android shows a "next field" key (->|) on form fields,
 * which moves focus itself and never sends Enter. So the form's single-line
 * fields get enterkeyhint="go" (unless they set their own), which swaps it for
 * a Go key that does send Enter - handled as above.
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
      // Fields added later (e.g. a new split row) get their hint on focus,
      // which is when the keyboard reads it.
      const onFocusin = (event: FocusEvent) => this.#askForGoKey(event.target);
      form
        .querySelectorAll('input')
        .forEach((field) => this.#askForGoKey(field));
      form.addEventListener('keydown', onKeydown);
      form.addEventListener('focusin', onFocusin);
      destroyRef.onDestroy(() => {
        form.removeEventListener('keydown', onKeydown);
        form.removeEventListener('focusin', onFocusin);
      });
    });
  }

  #askForGoKey(field: EventTarget | null): void {
    if (
      field instanceof HTMLInputElement &&
      ENTER_SUBMITS_INPUT_TYPES.has(field.type) &&
      !field.hasAttribute('enterkeyhint')
    ) {
      field.setAttribute('enterkeyhint', 'go');
    }
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
      !(field instanceof HTMLInputElement) ||
      !ENTER_SUBMITS_INPUT_TYPES.has(field.type) ||
      field.getAttribute('aria-expanded') === 'true'
    ) {
      return;
    }

    // Replaces the browser's own Enter-to-submit (see the class comment)
    event.preventDefault();
    field.blur();
    this.#appRef.tick();
    if (this.#button.disabled) {
      this.#nextField(form, field).focus();
    } else {
      this.#button.click();
    }
  }

  /** The next field after `field` that Enter can move to, else `field`. */
  #nextField(form: HTMLFormElement, field: HTMLInputElement): HTMLElement {
    const fields = Array.from(
      form.querySelectorAll<HTMLElement>(NEXT_FIELD_SELECTOR)
    );
    const next = fields
      .slice(fields.indexOf(field) + 1)
      .find((candidate) => this.#canMoveTo(candidate));
    return next ?? field;
  }

  #canMoveTo(candidate: HTMLElement): boolean {
    if (
      candidate instanceof HTMLInputElement &&
      !ENTER_SUBMITS_INPUT_TYPES.has(candidate.type)
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
