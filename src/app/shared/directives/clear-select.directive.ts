import { Directive, HostListener, input } from '@angular/core';
import { MatSelect } from '@angular/material/select';

@Directive({
  selector: '[appClearSelect]',
  standalone: true,
})
export class ClearSelectDirective {
  appClearSelect = input<MatSelect>();

  @HostListener('click')
  onClick() {
    if (this.appClearSelect) {
      this.appClearSelect().value = '';
      setTimeout(() => {
        this.appClearSelect().close();
      }, 10);
    }
  }
}
