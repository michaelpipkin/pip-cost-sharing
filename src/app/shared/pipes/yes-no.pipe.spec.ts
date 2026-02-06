import { describe, it, expect } from 'vitest';
import { YesNoPipe } from './yes-no.pipe';

describe('YesNoPipe', () => {
  const pipe = new YesNoPipe();

  it('should return "Yes" for true', () => {
    expect(pipe.transform(true)).toBe('Yes');
  });

  it('should return "No" for false', () => {
    expect(pipe.transform(false)).toBe('No');
  });
});
