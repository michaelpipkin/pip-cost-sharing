import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Selects the input's contents on focus so typing replaces the value.
 * Currency inputs get this (plus clearing a zero value) from
 * FormatCurrencyInputDirective instead.
 */
@Directive({
  selector: 'input[appSelectOnFocus]',
  host: { '(focus)': 'onFocus()' },
})
export class SelectOnFocusDirective {
  protected readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  onFocus(): void {
    this.el.nativeElement.select();
  }
}
