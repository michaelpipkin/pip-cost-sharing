import { DecimalPipe } from '@angular/common';
import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { FormArray, FormGroupDirective } from '@angular/forms';
import { StringUtils } from 'src/app/utilities/string-utils.service';

@Directive({
  selector: '[appFormatCurrencyInput]',
  standalone: true,
})
export class FormatCurrencyInputDirective {
  stringUtils = inject(StringUtils);
  decimalPipe = inject(DecimalPipe);
  formGroupDirective = inject(FormGroupDirective, { optional: true });

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
    this.el.nativeElement.value =
      this.decimalPipe.transform(calc, '1.2-2') || '0.00';
  }
}
