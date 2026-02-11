import { DecimalPipe } from '@angular/common';
import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { FormArray, FormGroupDirective } from '@angular/forms';
import { LocaleService } from '@services/locale.service';
import { StringUtils } from '@utils/string-utils.service';

@Directive({
  selector: '[appFormatCurrencyInput]',
  standalone: true,
})
export class FormatCurrencyInputDirective {
  protected readonly decimalPipe = inject(DecimalPipe);
  protected readonly localeService = inject(LocaleService);
  protected readonly formGroupDirective = inject(FormGroupDirective, {
    optional: true,
  });
  protected readonly stringUtils = inject(StringUtils);

  constructor(private el: ElementRef) {}

  @HostListener('blur', ['$event']) onBlur(event: FocusEvent) {
    const target = event.target as HTMLInputElement;
    if (!target || !target.value) return;

    let value = target.value.trim().replace(/\.([^\d]|$)/g, '$1');
    const calc = this.stringUtils.toNumber(value);

    if (this.formGroupDirective) {
      if (this.el.nativeElement.hasAttribute('parentControlName')) {
        const parentControlName =
          this.el.nativeElement.getAttribute('parentControlName');
        const parentControl = this.formGroupDirective.form.get(
          parentControlName
        ) as FormArray;
        const index = this.el.nativeElement.getAttribute('data-index');
        const controlName =
          this.el.nativeElement.getAttribute('formControlName');
        const control = parentControl.at(+index).get(controlName);
        if (control) {
          control.setValue(calc, { emitEvent: false });
        }
      } else {
        const controlName =
          this.el.nativeElement.getAttribute('formControlName');
        if (controlName) {
          const control = this.formGroupDirective.form.get(controlName);
          if (control) {
            control.setValue(calc, { emitEvent: false });
          }
        }
      }
    }

    // Format using currency's decimal separator
    const currency = this.localeService.currency();
    const formatted = this.formatWithCurrencySeparator(
      calc,
      currency.decimalPlaces,
      currency.decimalSeparator,
      currency.symbolPosition
    );
    this.el.nativeElement.value = formatted;
  }

  private formatWithCurrencySeparator(
    value: number,
    decimalPlaces: number,
    decimalSeparator: string,
    symbolPosition: 'prefix' | 'suffix' | 'none'
  ): string {
    // Format the number with fixed decimal places
    const fixed = value.toFixed(decimalPlaces);

    // Replace dot with currency's decimal separator
    const formatted = fixed.replace('.', decimalSeparator);

    // Add trailing space for suffix currencies to separate from symbol
    return symbolPosition === 'suffix' ? `${formatted} ` : formatted;
  }
}
