import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'yesNoCheck',
  standalone: true,
})
export class YesNoCheckPipe implements PipeTransform {
  transform(value: boolean): string {
    return value ? String.fromCodePoint(10004) : ' '; // NOSONAR
  }
}
