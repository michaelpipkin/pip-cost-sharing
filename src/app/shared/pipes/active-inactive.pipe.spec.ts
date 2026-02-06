import { describe, it, expect } from 'vitest';
import { ActiveInactivePipe } from './active-inactive.pipe';

describe('ActiveInactivePipe', () => {
  const pipe = new ActiveInactivePipe();

  it('should return "Active" for true', () => {
    expect(pipe.transform(true)).toBe('Active');
  });

  it('should return "Inactive" for false', () => {
    expect(pipe.transform(false)).toBe('Inactive');
  });
});
