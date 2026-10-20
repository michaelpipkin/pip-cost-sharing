import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LocaleService } from '@services/locale.service';
import { GroupStore } from '@store/group.store';
import { mockDocRef, mockMember } from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RentalEditDialogComponent,
  RentalEditDialogData,
} from './rental-edit-dialog.component';

describe('RentalEditDialogComponent', () => {
  let fixture: ComponentFixture<RentalEditDialogComponent>;
  let el: HTMLElement;

  const pat = mockMember({
    id: 'pat',
    displayName: 'Pat',
    ref: mockDocRef('groups/group-1/members/pat'),
  });
  const data: RentalEditDialogData = {
    rental: { nightCount: 2, stays: [{ memberRef: pat.ref!, nights: [0, 1] }] },
    totalAmount: 1234.5,
    availableMembers: [pat],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [RentalEditDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: GroupStore,
          useValue: { currentGroup: signal({ currencyCode: 'EUR' }) },
        },
        LocaleService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RentalEditDialogComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  const text = (testId: string) =>
    el.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();

  it("should show the total cost and the grid amounts in the group's currency", () => {
    expect(text('rental-edit-total-cost')).toBe('€ 1.234,50');
    expect(text('member-amount')).toBe('€ 1.234,50');
    expect(text('total-amount')).toBe('€ 1.234,50');
  });
});
