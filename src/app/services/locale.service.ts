import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { getCurrencyConfig } from '@models/currency-config.interface';
import { GroupStore } from '@store/group.store';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly groupStore = inject(GroupStore);

  // Browser locale detection
  private browserLocale = signal<string>(navigator.language || 'en-US');

  // Current group's currency (set automatically from GroupStore)
  private currentCurrencyCode = signal<string>('USD');

  // Computed currency configuration
  currency = computed(() => {
    const code = this.currentCurrencyCode();
    return getCurrencyConfig(code) || getCurrencyConfig('USD')!;
  });

  // Locale for number formatting (can be browser locale)
  locale = this.browserLocale.asReadonly();

  constructor() {
    // Automatically update currency when current group changes
    effect(() => {
      const group = this.groupStore.currentGroup();
      if (group?.currencyCode) {
        this.currentCurrencyCode.set(group.currencyCode);
      }
    });
  }

  /**
   * Set the current currency based on active group
   * Called manually if needed (primarily used by effect above)
   */
  setGroupCurrency(currencyCode: string): void {
    this.currentCurrencyCode.set(currencyCode);
  }

  /**
   * Format a number as currency using current group's currency
   */
  formatCurrency(value: number): string {
    const curr = this.currency();

    // Format manually using currency's decimal and thousands separators
    const absValue = Math.abs(value);
    const fixed = absValue.toFixed(curr.decimalPlaces);
    const [integerPart, decimalPart] = fixed.split('.');

    // Add thousands separators
    const formattedInteger = integerPart.replace(
      /\B(?=(\d{3})+(?!\d))/g,
      curr.thousandsSeparator
    );

    // Combine integer and decimal parts with correct decimal separator
    const formatted =
      curr.decimalPlaces > 0
        ? `${formattedInteger}${curr.decimalSeparator}${decimalPart}`
        : formattedInteger;

    const symbol =
      curr.symbolPosition === 'none'
        ? formatted
        : curr.symbolPosition === 'prefix'
          ? `${curr.symbol} ${formatted}`
          : `${formatted} ${curr.symbol}`;

    return value < 0 ? `-${symbol}` : symbol;
  }

  /**
   * Round to currency's decimal places
   */
  roundToCurrency(value: number): number {
    if (isNaN(value)) {
      return 0;
    }
    const places = this.currency().decimalPlaces;
    const multiplier = Math.pow(10, places);
    return Math.round(value * multiplier) / multiplier;
  }

  /**
   * Get decimal format pattern for DecimalPipe
   */
  getDecimalFormat(): string {
    const places = this.currency().decimalPlaces;
    return `1.${places}-${places}`;
  }

  /**
   * Get smallest currency increment (e.g., 0.01 for USD, 0.05 for CHF, 1 for JPY)
   */
  getSmallestIncrement(): number {
    const places = this.currency().decimalPlaces;
    return places === 0 ? 1 : 1 / Math.pow(10, places);
  }

  /**
   * Get formatted zero value for current currency
   * Returns '0,00' for SEK (suffix), '0,00' for EUR, '0.00' for USD, '0' for JPY, etc.
   */
  getFormattedZero(): string {
    const curr = this.currency();
    if (curr.decimalPlaces === 0) {
      return '0';
    }
    return `0${curr.decimalSeparator}${'0'.repeat(curr.decimalPlaces)}`;
  }
}
