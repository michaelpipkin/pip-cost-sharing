import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'activeInactive',
  standalone: true,
})
export class ActiveInactivePipe implements PipeTransform {
  transform(value: boolean): string {
    return value ? 'Active' : 'Inactive';
  }
}
