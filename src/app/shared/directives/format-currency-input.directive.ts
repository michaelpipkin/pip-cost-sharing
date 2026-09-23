import { Directive, ElementRef, inject } from '@angular/core';
import { LocaleService } from '@services/locale.service';
import { StringUtils } from '@utils/string-utils.service';

@Directive({
  selector: 'input[appFormatCurrencyInput]',
  host: {
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()',
  },
})
export class FormatCurrencyInputDirective {
  protected readonly localeService = inject(LocaleService);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  // A zero amount is cleared so the user can type straight over it; any other
  // value is selected so typing replaces it
  onFocus(): void {
    const input = this.el.nativeElement;
    if (input.value.trim() === this.localeService.getFormattedZero()) {
      input.value = '';
    } else {
      input.select();
    }
  }

  onBlur(): void {
    const input = this.el.nativeElement;
    const raw = input.value.trim().replaceAll(/\.([^\d]|$)/g, '$1');
    const calc = raw ? this.stringUtils.toNumber(raw) : 0;

    const currency = this.localeService.currency();
    input.value = this.formatWithCurrencySeparator(
      calc,
      currency.decimalPlaces,
      currency.decimalSeparator,
      currency.symbolPosition
    );

    // Dispatch input AFTER formatting so [formField] reads the formatted value
    input.dispatchEvent(new Event('input', { bubbles: true }));
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
