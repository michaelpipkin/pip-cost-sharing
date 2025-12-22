import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appDateShortcutKeys]',
  standalone: true,
})
export class DateShortcutKeysDirective {
  readonly #ngControl = inject(NgControl);
  readonly #el = inject(ElementRef);

  appDateShortcutKeys = input<any>();

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (['-', '+', 't', 'm', 'y'].includes(event.key)) {
      const inputDate = new Date(this.#el.nativeElement.value);
      const today = new Date();
      if (inputDate.toString() !== 'Invalid Date') {
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
        this.#ngControl.control?.patchValue(newDate);
      } else {
        this.#ngControl.control?.patchValue(today);
      }
      event.preventDefault();
    }
  }
}
