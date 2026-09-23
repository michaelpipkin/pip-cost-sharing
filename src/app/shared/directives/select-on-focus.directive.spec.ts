import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectOnFocusDirective } from './select-on-focus.directive';

@Component({
  imports: [SelectOnFocusDirective],
  template: `
    <input appSelectOnFocus value="0" />
  `,
})
class HostComponent {}

describe('SelectOnFocusDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let input: HTMLInputElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    input = fixture.nativeElement.querySelector('input');
  });

  it('should select the contents on focus without clearing them', () => {
    const selectSpy = vi.spyOn(input, 'select');
    input.dispatchEvent(new FocusEvent('focus'));
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('0');
  });

  it('should attach a single handler however many times the view renders', () => {
    const selectSpy = vi.spyOn(input, 'select');
    fixture.detectChanges();
    fixture.detectChanges();
    input.dispatchEvent(new FocusEvent('focus'));
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });
});
