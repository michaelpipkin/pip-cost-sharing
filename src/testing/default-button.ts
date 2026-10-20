import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DefaultButtonDirective } from '@directives/default-button.directive';
import { expect } from 'vitest';

/**
 * Asserts that Enter in the component's form will save it: a Save button
 * carries DefaultButtonDirective and belongs to the form (inside it, or
 * linked by its `form` attribute). DefaultButtonDirective's own spec covers
 * what happens on Enter.
 */
export function expectEnterToSave(fixture: ComponentFixture<unknown>): void {
  const save = fixture.debugElement.query(By.directive(DefaultButtonDirective));
  expect(save, 'no button[defaultButton] is rendered').toBeTruthy();
  const form = fixture.nativeElement.querySelector('form');
  expect(form, 'no <form> is rendered').toBeTruthy();
  expect((save.nativeElement as HTMLButtonElement).form).toBe(form);
}
