import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { DocumentReference } from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DocRefCompareDirective } from './doc-ref-compare.directive';

@Component({
  imports: [MatSelectModule, DocRefCompareDirective],
  template: `
    <mat-select docRefCompare></mat-select>
    <mat-select></mat-select>
  `,
})
class HostComponent {}

function refAt(path: string): DocumentReference {
  return new (DocumentReference as any)(path.split('/').pop(), path);
}

describe('DocRefCompareDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let selects: MatSelect[];
  let compareWith: (a: any, b: any) => boolean;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    selects = fixture.debugElement
      .queryAll(By.directive(MatSelect))
      .map((d) => d.componentInstance as MatSelect);
    compareWith = selects[0]!.compareWith;
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should replace the default compareWith only on the marked select', () => {
    expect(compareWith).not.toBe(selects[1]!.compareWith);
    // The default compares by identity, so distinct refs differ.
    expect(selects[1]!.compareWith(refAt('groups/g1'), refAt('groups/g1'))).toBe(
      false
    );
  });

  it('should match distinct instances with the same path', () => {
    expect(compareWith(refAt('groups/g1'), refAt('groups/g1'))).toBe(true);
  });

  it('should not match different paths', () => {
    expect(compareWith(refAt('groups/g1'), refAt('groups/g2'))).toBe(false);
  });

  it('should match null with null', () => {
    expect(compareWith(null, null)).toBe(true);
  });

  it('should not match null with a ref, in either order', () => {
    expect(compareWith(null, refAt('groups/g1'))).toBe(false);
    expect(compareWith(refAt('groups/g1'), null)).toBe(false);
  });
});
