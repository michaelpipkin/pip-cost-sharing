import { Directive, ElementRef, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { FORM_FIELD } from '@angular/forms/signals';

@Directive({
  selector: '[appDateShortcutKeys]',
  host: { '(keydown)': 'onKeyDown($event)' },
})
export class DateShortcutKeysDirective {
  readonly #formField = inject(FORM_FIELD, { optional: true });
  readonly #ngControl = inject(NgControl, { optional: true });
  readonly #el = inject(ElementRef);

  onKeyDown(event: KeyboardEvent) {
    // Leave browser and OS shortcuts (Ctrl+T, Ctrl+Y, Cmd+M, ...) alone
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (['-', '+', 't', 'm', 'y'].includes(event.key)) {
      const inputDate = new Date(this.#el.nativeElement.value);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (inputDate.toString() === 'Invalid Date') {
        this.#setValue(today);
      } else {
        let newDate: Date;
        switch (event.key) {
          case '-':
            newDate = new Date(inputDate.setDate(inputDate.getDate() - 1));
            break;
          case '+':
            newDate = new Date(inputDate.setDate(inputDate.getDate() + 1));
            break;
          case 'm':
            newDate = new Date(
              inputDate.getFullYear(),
              inputDate.getMonth(),
              1
            );
            break;
          case 'y':
            newDate = new Date(inputDate.getFullYear(), 0, 1);
            break;
          case 't':
          default:
            newDate = today;
        }
        this.#setValue(newDate);
      }
      event.preventDefault();
    }
  }

  #setValue(date: Date): void {
    if (this.#formField) {
      this.#formField.state().value.set(date);
    } else {
      this.#ngControl?.control?.patchValue(date);
    }
  }
}
