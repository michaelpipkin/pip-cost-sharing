import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currency',
})
export class CurrencyPipe implements PipeTransform {
  transform(value: number, ...args: unknown[]): string {
    if (value < 0) {
      return `-$${Math.abs(value).toFixed(2)}`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  }
}
