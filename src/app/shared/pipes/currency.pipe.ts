import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleService } from '@services/locale.service';

@Pipe({
  name: 'currency',
  standalone: true,
  pure: false, // Impure pipe to react to currency changes in LocaleService
})
export class CurrencyPipe implements PipeTransform {
  private localeService = inject(LocaleService);

  transform(value: number): string {
    return this.localeService.formatCurrency(value);
  }
}
