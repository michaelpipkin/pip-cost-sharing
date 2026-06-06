import { validateTree } from '@angular/forms/signals';

export function applyPasswordMatch(fieldPath: any): void {
  validateTree(fieldPath, ({ value }) => {
    const v = value() as { password: string; confirmPassword: string };
    return v.password !== v.confirmPassword
      ? { kind: 'passwordMismatch', message: 'Passwords do not match.' }
      : null;
  });
}
