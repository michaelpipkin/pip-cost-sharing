import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appDatePlusMinus]',
  standalone: true,
})
export class DatePlusMinusDirective {
  @Input() appDatePlusMinus: any;

  constructor(
    private ngControl: NgControl,
    private el: ElementRef
  ) {}

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (['-', '+'].includes(event.key)) {
      const currentDate = new Date(this.el.nativeElement.value);
      if (currentDate.toString() !== 'Invalid Date') {
        let newDate: Date;
        if (event.key === '-') {
          newDate = new Date(currentDate.setDate(currentDate.getDate() - 1));
        } else if (event.key === '+') {
          newDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
        }
        this.ngControl.control?.patchValue(newDate);
      } else {
        this.ngControl.control?.patchValue(new Date());
      }
      event.preventDefault();
    }
  }
}
