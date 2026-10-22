import { DocumentReference } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import './doc-ref-extensions';

function refAt(path: string): DocumentReference {
  return new (DocumentReference as any)(path.split('/').pop(), path);
}

describe('DocumentReference.prototype.eq', () => {
  it('should be true for the same path on a distinct instance', () => {
    const a = refAt('groups/g1/members/m1');
    const b = refAt('groups/g1/members/m1');
    expect(a).not.toBe(b);
    expect(a.eq(b)).toBe(true);
  });

  it('should be false for a different path', () => {
    expect(refAt('groups/g1/members/m1').eq(refAt('groups/g1/members/m2'))).toBe(
      false
    );
  });

  it('should not match refs that merely share an id', () => {
    expect(refAt('groups/g1/members/m1').eq(refAt('groups/g2/members/m1'))).toBe(
      false
    );
  });

  it('should be false for null and undefined', () => {
    const a = refAt('groups/g1');
    expect(a.eq(null as any)).toBe(false);
    expect(a.eq(undefined as any)).toBe(false);
  });

  it('should be reflexive', () => {
    const a = refAt('groups/g1');
    expect(a.eq(a)).toBe(true);
  });

  it('should be symmetric', () => {
    const a = refAt('groups/g1');
    const b = refAt('groups/g1');
    expect(a.eq(b)).toBe(b.eq(a));
  });
});
