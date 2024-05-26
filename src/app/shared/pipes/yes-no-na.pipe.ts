import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'yesNoNa',
  standalone: true,
})
export class YesNoNaPipe implements PipeTransform {
  transform(value: unknown, ...args: unknown[]): unknown {
    if (args[0] === args[1]) {
      return 'N/A';
    }
    return value ? 'Yes' : 'No';
  }
}
