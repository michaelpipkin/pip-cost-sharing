import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { FORM_FIELD } from '@angular/forms/signals';

@Directive({
  selector: '[appDateShortcutKeys]',
  standalone: true,
})
export class DateShortcutKeysDirective {
  readonly #formField = inject(FORM_FIELD, { optional: true });
  readonly #ngControl = inject(NgControl, { optional: true });
  readonly #el = inject(ElementRef);

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (['-', '+', 't', 'm', 'y'].includes(event.key)) {
      const inputDate = new Date(this.#el.nativeElement.value);
      const today = new Date();
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
