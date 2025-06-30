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
    if (this.appClearSelect) {
      this.appClearSelect().value = this.clearValue();
      setTimeout(() => {
        this.appClearSelect().close();
      }, 10);
    }
  }
}
