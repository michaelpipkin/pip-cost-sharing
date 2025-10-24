import { Injectable, signal, computed, effect, inject } from '@angular/core';
import {
  CurrencyConfig,
  getCurrencyConfig,
} from '@models/currency-config.interface';
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
    const formatted = Math.abs(value).toLocaleString(this.locale(), {
      minimumFractionDigits: curr.decimalPlaces,
      maximumFractionDigits: curr.decimalPlaces,
    });

    const symbol =
      curr.symbolPosition === 'prefix'
        ? `${curr.symbol}${formatted}`
        : `${formatted}${curr.symbol}`;

    return value < 0 ? `-${symbol}` : symbol;
  }

  /**
   * Round to currency's decimal places
   */
  roundToCurrency(value: number): number {
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
}
