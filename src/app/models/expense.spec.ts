import { Expense } from '@models/expense';
import { mockDocRef } from '@testing/test-helpers';
import * as storageModule from 'firebase/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Expense', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('defaults and init', () => {
    it('should default to the amount split method and unpaid', () => {
      const expense = new Expense();
      expect(expense.splitMethod).toBe('amount');
      expect(expense.paid).toBe(false);
    });

    it('should assign the init fields', () => {
      const date = new Date(2026, 5, 15);
      const paidBy = mockDocRef('groups/g1/members/m1');
      const expense = new Expense({
        id: 'e1',
        description: 'Dinner',
        date,
        totalAmount: 42.5,
        splitMethod: 'shares',
        paid: true,
        paidByMemberRef: paidBy,
      });
      expect(expense.id).toBe('e1');
      expect(expense.description).toBe('Dinner');
      expect(expense.date).toBe(date);
      expect(expense.totalAmount).toBe(42.5);
      expect(expense.splitMethod).toBe('shares');
      expect(expense.paid).toBe(true);
      expect(expense.paidByMemberRef).toBe(paidBy);
    });
  });

  describe('hasReceipt', () => {
    it('should be false when receiptPath is undefined', () => {
      expect(new Expense().hasReceipt).toBe(false);
    });

    it('should be false when receiptPath is null', () => {
      expect(new Expense({ receiptPath: null }).hasReceipt).toBe(false);
    });

    it('should be false when receiptPath is an empty string', () => {
      expect(new Expense({ receiptPath: '' }).hasReceipt).toBe(false);
    });

    it('should be true for a path', () => {
      expect(
        new Expense({ receiptPath: 'receipts/g1/e1.jpg' }).hasReceipt
      ).toBe(true);
    });
  });

  describe('receiptRef', () => {
    it('should be null without a receipt path and not touch Storage', () => {
      const getStorageSpy = vi.spyOn(storageModule, 'getStorage');
      const refSpy = vi.spyOn(storageModule, 'ref');
      expect(new Expense().receiptRef).toBeNull();
      expect(new Expense({ receiptPath: '' }).receiptRef).toBeNull();
      expect(new Expense({ receiptPath: null }).receiptRef).toBeNull();
      expect(getStorageSpy).not.toHaveBeenCalled();
      expect(refSpy).not.toHaveBeenCalled();
    });

    it('should build the storage ref from the default storage and the path', () => {
      const storage = { app: 'storage-instance' } as any;
      const storageRef = { fullPath: 'receipts/g1/e1.jpg' } as any;
      vi.spyOn(storageModule, 'getStorage').mockReturnValue(storage);
      const refSpy = vi.spyOn(storageModule, 'ref').mockReturnValue(storageRef);

      const result = new Expense({ receiptPath: 'receipts/g1/e1.jpg' })
        .receiptRef;

      expect(result).toBe(storageRef);
      expect(refSpy).toHaveBeenCalledWith(storage, 'receipts/g1/e1.jpg');
    });
  });
});
