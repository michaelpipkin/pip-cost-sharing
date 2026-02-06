import { Directive, HostListener, input } from '@angular/core';
import { MatSelect } from '@angular/material/select';

@Directive({
  selector: '[appClearSelect]',
  standalone: true,
})
export class ClearSelectDirective {
  appClearSelect = input<MatSelect>();
  clearValue = input<any>('');

  @HostListener('click')
  onClick() {
    const select = this.appClearSelect();
    if (select) {
      select.value = this.clearValue();
      setTimeout(() => {
        select.close();
      }, 10);
    }
  }
}
