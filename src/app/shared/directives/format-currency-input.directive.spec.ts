import { ComponentFixture } from '@angular/core/testing';
import { FormatCurrencyInputDirective } from './format-currency-input.directive';

describe('FormatCurrencyInputDirective', () => {
  let fixture: ComponentFixture<FormatCurrencyInputDirective>;

  it('should create an instance', () => {
    const debugElement = fixture.debugElement;
    const nativeElement = debugElement.nativeElement;
    const directive = new FormatCurrencyInputDirective(nativeElement);
    expect(directive).toBeTruthy();
  });
});
