import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { StringUtils } from 'src/app/utilities/string-utils.service';

@Directive({
  selector: '[appFormatCurrencyInput]',
  standalone: true,
})
export class FormatCurrencyInputDirective {
  stringUtils = inject(StringUtils);

  constructor(private el: ElementRef) {}

  @HostListener('change', ['$event.target.value']) onInput(value: string) {
    this.el.nativeElement.value = this.stringUtils.toNumber(value).toFixed(2);
  }
}
