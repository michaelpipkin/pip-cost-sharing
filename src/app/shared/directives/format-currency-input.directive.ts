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
  protected readonly el = inject(ElementRef);

  @HostListener('blur', ['$event']) onBlur(event: FocusEvent) {
    const target = event.target as HTMLInputElement;
    const raw = (target?.value ?? '').trim().replaceAll(/\.([^\d]|$)/g, '$1');
    const calc = raw ? this.stringUtils.toNumber(raw) : 0;

    const currency = this.localeService.currency();
    this.el.nativeElement.value = this.formatWithCurrencySeparator(
      calc,
      currency.decimalPlaces,
      currency.decimalSeparator,
      currency.symbolPosition
    );

    if (this.formGroupDirective) {
      this.#updateReactiveFormControl(calc);
    } else {
      // Signals forms context: dispatch input AFTER formatting so [formField] reads formatted value
      this.el.nativeElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  #updateReactiveFormControl(calc: number): void {
    const el = this.el.nativeElement;
    if (el.hasAttribute('parentControlName')) {
      const parentControl = this.formGroupDirective!.form.get(
        el.getAttribute('parentControlName')
      ) as FormArray;
      const control = parentControl.at(+el.dataset.index).get(
        el.getAttribute('formControlName')
      );
      if (control) {
        control.setValue(calc, { emitEvent: false });
      }
    } else {
      const controlName = el.getAttribute('formControlName');
      if (controlName) {
        const control = this.formGroupDirective!.form.get(controlName);
        if (control) {
          control.setValue(calc, { emitEvent: false });
        }
      }
    }
  }

  private formatWithCurrencySeparator(
    value: number,
    decimalPlaces: number,
    decimalSeparator: string,
    symbolPosition: 'prefix' | 'suffix' | 'none'
  ): string {
    const fixed = value.toFixed(decimalPlaces);
    const formatted = fixed.replace('.', decimalSeparator);
    return symbolPosition === 'suffix' ? `${formatted} ` : formatted;
  }
}
