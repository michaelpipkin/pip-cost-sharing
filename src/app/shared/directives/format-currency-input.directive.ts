import { DecimalPipe } from '@angular/common';
import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { StringUtils } from 'src/app/utilities/string-utils.service';

@Directive({
  selector: '[appFormatCurrencyInput]',
  standalone: true,
})
export class FormatCurrencyInputDirective {
  stringUtils = inject(StringUtils);
  decimalPipe = inject(DecimalPipe);

  constructor(private el: ElementRef) {}

  @HostListener('change', ['$event.target.value']) onInput(value: string) {
    const calc = this.stringUtils.toNumber(value);
    this.el.nativeElement.value =
      this.decimalPipe.transform(calc, '1.2-2') || '0.00';
  }
}
