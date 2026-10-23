import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import { applyPasswordMatch } from './password-match-schema';

function createForm(password: string, confirmPassword: string) {
  const model = signal({ password, confirmPassword });
  const f = runInInjectionContext(TestBed.inject(Injector), () =>
    form(model, (path) => applyPasswordMatch(path))
  );
  return { model, f };
}

describe('applyPasswordMatch', () => {
  it('should flag a mismatch with the passwordMismatch error', () => {
    const { f } = createForm('secret1', 'secret2');
    const errors = f().errors();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe('passwordMismatch');
    expect((errors[0]! as { message?: string }).message).toBe(
      'Passwords do not match.'
    );
    expect(f().valid()).toBe(false);
  });

  it('should give no error when the passwords are equal', () => {
    const { f } = createForm('secret1', 'secret1');
    expect(f().errors()).toEqual([]);
    expect(f().valid()).toBe(true);
  });

  it('should give no error when both are empty', () => {
    const { f } = createForm('', '');
    expect(f().errors()).toEqual([]);
  });

  it('should be case sensitive', () => {
    const { f } = createForm('Secret1', 'secret1');
    expect(f().errors().map((e) => e.kind)).toEqual(['passwordMismatch']);
  });

  it('should re-evaluate when the model changes', () => {
    const { model, f } = createForm('secret1', 'secret1');
    expect(f().valid()).toBe(true);
    model.set({ password: 'secret1', confirmPassword: 'other' });
    expect(f().errors().map((e) => e.kind)).toEqual(['passwordMismatch']);
    model.set({ password: 'other', confirmPassword: 'other' });
    expect(f().errors()).toEqual([]);
  });
});
