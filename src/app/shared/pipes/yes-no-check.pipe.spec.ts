import { describe, expect, it } from 'vitest';
import { YesNoCheckPipe } from './yes-no-check.pipe';

describe('YesNoCheckPipe', () => {
  const pipe = new YesNoCheckPipe();

  it('should show a check mark for true', () => {
    expect(pipe.transform(true)).toBe('✔');
  });

  it('should show a blank space for false', () => {
    expect(pipe.transform(false)).toBe(' ');
  });
});
