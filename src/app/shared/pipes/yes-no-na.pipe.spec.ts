import { describe, it, expect } from 'vitest';
import { YesNoNaPipe } from './yes-no-na.pipe';

describe('YesNoNaPipe', () => {
  const pipe = new YesNoNaPipe();

  it('should return "Yes" when value is true and args differ', () => {
    expect(pipe.transform(true, 'a', 'b')).toBe('Yes');
  });

  it('should return "No" when value is false and args differ', () => {
    expect(pipe.transform(false, 'a', 'b')).toBe('No');
  });

  it('should return "N/A" when both args are equal primitives', () => {
    expect(pipe.transform(true, 'same', 'same')).toBe('N/A');
    expect(pipe.transform(false, 'same', 'same')).toBe('N/A');
  });

  it('should return "N/A" when both args are objects with same path', () => {
    const ref1 = { path: 'groups/abc123' };
    const ref2 = { path: 'groups/abc123' };
    expect(pipe.transform(true, ref1, ref2)).toBe('N/A');
  });

  it('should return "Yes"/"No" when objects have different paths', () => {
    const ref1 = { path: 'groups/abc123' };
    const ref2 = { path: 'groups/def456' };
    expect(pipe.transform(true, ref1, ref2)).toBe('Yes');
    expect(pipe.transform(false, ref1, ref2)).toBe('No');
  });
});
