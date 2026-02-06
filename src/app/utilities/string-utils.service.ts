import { inject, Injectable } from '@angular/core';
import { LocaleService } from '@services/locale.service';

@Injectable({
  providedIn: 'root',
})
export class StringUtils {
  protected readonly localeService = inject(LocaleService);

  toNumber(str: string): number {
    try {
      if (typeof str !== 'string' || str.trim() === '') {
        return 0;
      }

      // Get current currency's decimal separator
      const currency = this.localeService.currency();
      const decimalSeparator = currency.decimalSeparator;

      // Normalize the input: replace locale-specific decimal separator with dot
      let normalized = str;
      if (decimalSeparator !== '.') {
        // Replace comma with dot for parsing
        normalized = str.replace(decimalSeparator, '.');
      }

      // Simple math expression evaluator using Function constructor
      // Sanitize input to only allow numbers, basic operators, parentheses, and decimals
      const sanitized = normalized.replace(/[^0-9+\-*/().\s]/g, '');

      if (sanitized !== normalized) {
        // If sanitization changed the string, it contained invalid characters
        return 0;
      }

      // Use Function constructor to safely evaluate simple math expressions
      const result = new Function('return (' + sanitized + ')')();

      if (
        result === null ||
        result === undefined ||
        Number.isNaN(result) ||
        !Number.isFinite(result) ||
        typeof result === 'object' ||
        Math.abs(result) > Number.MAX_SAFE_INTEGER
      ) {
        return 0;
      }

      // Round to currency's decimal places
      return this.localeService.roundToCurrency(result);
    } catch {
      return 0;
    }
  }
}
