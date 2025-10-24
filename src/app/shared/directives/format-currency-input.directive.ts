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
  protected readonly stringUtils = inject(StringUtils);
  protected readonly decimalPipe = inject(DecimalPipe);
  protected readonly localeService = inject(LocaleService);
  protected readonly formGroupDirective = inject(FormGroupDirective, {
    optional: true,
  });

  constructor(private el: ElementRef) {}

  @HostListener('blur', ['$event.target.value']) onBlur(value: string) {
    value = value.trim().replace(/\.([^\d]|$)/g, '$1');
    const calc = this.stringUtils.toNumber(value);

    if (this.formGroupDirective) {
      if (this.el.nativeElement.hasAttribute('parentControlName')) {
        const parentControlName =
          this.el.nativeElement.getAttribute('parentControlName');
        const parentControl = this.formGroupDirective.form.get(
          parentControlName
        ) as FormArray;
        const index = this.el.nativeElement.index;
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

    // Use locale service for dynamic decimal formatting
    const pattern = this.localeService.getDecimalFormat();
    const locale = this.localeService.locale();
    const currency = this.localeService.currency();
    const defaultValue = '0'.padEnd(currency.decimalPlaces > 0 ? currency.decimalPlaces + 2 : 1, '.0');

    this.el.nativeElement.value =
      this.decimalPipe.transform(calc, pattern, locale) || defaultValue;
  }
}
