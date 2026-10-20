import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleService } from '@services/locale.service';

/**
 * Formats money in the current group's currency (symbol, separators and
 * decimal places from LocaleService). Deliberately not named `currency`, so a
 * template can't silently fall back to Angular's USD-only CurrencyPipe; the
 * eslint config also bans importing that one.
 */
@Pipe({
  name: 'groupCurrency',
  pure: false, // Impure pipe to react to currency changes in LocaleService
})
export class GroupCurrencyPipe implements PipeTransform {
  protected readonly localeService = inject(LocaleService);

  transform(value: number): string {
    return this.localeService.formatCurrency(value);
  }
}
