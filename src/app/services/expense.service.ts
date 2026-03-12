import { inject, Injectable } from '@angular/core';
import { Category } from '@models/category';
import { Expense, ExpenseDto } from '@models/expense';
import { Member } from '@models/member';
import { Split, SplitDto } from '@models/split';
import { AnalyticsService } from '@services/analytics.service';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { MemberStore } from '@store/member.store';
import {
  collection,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, getStorage, ref, uploadBytes } from 'firebase/storage';
import { IExpenseService } from './expense.service.interface';

@Injectable({
  providedIn: 'root',
})
export class ExpenseService implements IExpenseService {
  protected readonly fs = inject(getFirestore);
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);

  async getGroupExpensesByDateRange(
    groupId: string,
    startDate?: Date,
    endDate?: Date,
    unpaidOnly?: boolean,
    memberRef?: DocumentReference<Member> | null,
    categoryRef?: DocumentReference<Category> | null
  ): Promise<Expense[]> {
    // Wait for stores to be loaded before processing
    while (!this.categoryStore.loaded() || !this.memberStore.loaded()) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const isoStartDate = startDate ? startDate.toIsoFormat() : null;
    const isoEndDate = endDate ? endDate.toIsoFormat() : null;

    // Build split query
    let splitQuery = query(collection(this.fs, `groups/${groupId}/splits`));
    if (startDate) {
      splitQuery = query(splitQuery, where('date', '>=', isoStartDate));
    }
    if (endDate) {
      splitQuery = query(splitQuery, where('date', '<=', isoEndDate));
    }

    // Build expense query
    let expenseQuery = query(collection(this.fs, `groups/${groupId}/expenses`));
    if (startDate) {
      expenseQuery = query(expenseQuery, where('date', '>=', isoStartDate));
    }
    if (endDate) {
      expenseQuery = query(expenseQuery, where('date', '<=', isoEndDate));
    }
    if (unpaidOnly) {
      expenseQuery = query(expenseQuery, where('paid', '==', false));
    }
    if (memberRef) {
      expenseQuery = query(
        expenseQuery,
        where('paidByMemberRef', '==', memberRef)
      );
    }
    if (categoryRef) {
      expenseQuery = query(
        expenseQuery,
        where('categoryRef', '==', categoryRef)
      );
    }

    expenseQuery = query(expenseQuery, orderBy('date', 'desc'), limit(200));

    // Execute all queries in parallel
    const [splitSnap, expenseSnap] = await Promise.all([
      getDocs(splitQuery),
      getDocs(expenseQuery),
    ]);

    // Process splits
    const splits = splitSnap.docs.map((doc) => {
      const data = doc.data();
      return new Split({
        id: doc.id,
        ...data,
        date: data.date.parseDate(),
        category: this.categoryStore.getCategoryByRef(data.categoryRef),
        paidByMember: this.memberStore.getMemberByRef(data.paidByMemberRef),
        owedByMember: this.memberStore.getMemberByRef(data.owedByMemberRef),
        ref: doc.ref as DocumentReference<Split>,
      });
    });

    // Build and return expenses
    const expenses = expenseSnap.docs.map((doc) => {
      const data = doc.data();
      return new Expense({
        id: doc.id,
        ...data,
        date: data.date.parseDate(),
        category: this.categoryStore.getCategoryByRef(data.categoryRef),
        paidByMember: this.memberStore.getMemberByRef(data.paidByMemberRef),
        ref: doc.ref as DocumentReference<Expense>,
        splits: splits.filter((s) => s.expenseRef.eq(doc.ref)),
      });
    });

    return expenses;
  }

  async getExpense(groupId: string, expenseId: string): Promise<Expense> {
    try {
      // Wait for stores to be loaded before processing
      while (!this.categoryStore.loaded() || !this.memberStore.loaded()) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const expenseReference = doc(
        this.fs,
        `groups/${groupId}/expenses/${expenseId}`
      );

      // Build split query
      const splitQuery = query(
        collection(this.fs, `/groups/${groupId}/splits/`),
        where(
          'expenseRef',
          '==',
          expenseReference as DocumentReference<Expense>
        )
      );

      // Execute both queries in parallel
      const [expenseDoc, splitDocs] = await Promise.all([
        getDoc(expenseReference),
        getDocs(splitQuery),
      ]);

      if (!expenseDoc.exists()) {
        throw new Error('Expense not found');
      }
      const data = expenseDoc.data();
      const expense = new Expense({
        id: expenseDoc.id,
        ...data,
        date: data.date.parseDate(),
        category: this.categoryStore.getCategoryByRef(data.categoryRef),
        paidByMember: this.memberStore.getMemberByRef(data.paidByMemberRef),
        ref: expenseDoc.ref as DocumentReference<Expense>,
      });

      expense.splits = splitDocs.docs.map((doc) => {
        const data = doc.data();
        return new Split({
          id: doc.id,
          ...data,
          date: data.date.parseDate(),
          category: this.categoryStore.getCategoryByRef(data.categoryRef),
          paidByMember: this.memberStore.getMemberByRef(data.paidByMemberRef),
          owedByMember: this.memberStore.getMemberByRef(data.owedByMemberRef),
          ref: doc.ref as DocumentReference<Split>,
        });
      });

      return expense;
    } catch (error) {
      this.analytics.logError(
        'Expense Service',
        'getExpense',
        'Failed to get expense',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async addExpense(
    groupId: string,
    expense: Partial<ExpenseDto>,
    splits: Partial<SplitDto>[],
    receipt: File | null = null
  ): Promise<DocumentReference<Expense>> {
    const batch = writeBatch(this.fs);
    const expenseRef = doc(collection(this.fs, `/groups/${groupId}/expenses`));

    try {
      // Upload receipt if provided
      if (receipt) {
        const storageRef = ref(
          this.storage,
          `groups/${groupId}/receipts/${expenseRef.id}`
        );
        expense.receiptPath = storageRef.fullPath;
        await uploadBytes(storageRef, receipt);
        this.analytics.logEvent('receipt_uploaded');
      }

      // Set expense and splits in batch
      batch.set(expenseRef, expense);
      splits.forEach((split) => {
        split.expenseRef = expenseRef as DocumentReference<Expense>;
        const splitRef = doc(collection(this.fs, `/groups/${groupId}/splits`));
        batch.set(splitRef, split);
      });

      await batch.commit();
      return expenseRef as DocumentReference<Expense>;
    } catch (error) {
      // Clean up uploaded receipt if batch commit fails
      if (receipt) {
        const storageRef = ref(
          this.storage,
          `groups/${groupId}/receipts/${expenseRef.id}`
        );
        deleteObject(storageRef).catch((deleteError) => {
          this.analytics.logEvent('delete_receipt_error', {
            error:
              deleteError instanceof Error
                ? deleteError.message
                : 'Unknown error',
          });
        });
      }

      this.analytics.logError(
        'Expense Service',
        'addExpense',
        'Failed to add expense',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async updateExpense(
    groupId: string,
    expenseRef: DocumentReference<Expense>,
    changes: Partial<ExpenseDto>,
    splits: Partial<SplitDto>[],
    receipt: File | null = null
  ): Promise<void> {
    try {
      // Upload receipt if provided
      if (receipt) {
        const storageRef = ref(
          this.storage,
          `groups/${groupId}/receipts/${expenseRef.id}`
        );
        try {
          await uploadBytes(storageRef, receipt);
          changes.receiptPath = storageRef.fullPath;
          this.analytics.logEvent('receipt_uploaded');
        } catch (error) {
          this.analytics.logEvent('receipt_upload_failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          throw new Error('Failed to upload receipt');
        }
      }

      const batch = writeBatch(this.fs);
      batch.update(expenseRef, changes);

      // Delete existing splits and add new ones
      const splitQuery = query(
        collection(this.fs, `/groups/${groupId}/splits/`),
        where('expenseRef', '==', expenseRef)
      );
      const queryDocs = await getDocs(splitQuery);
      queryDocs.forEach((d) => {
        batch.delete(d.ref);
      });

      splits.forEach((split) => {
        split.expenseRef = expenseRef as DocumentReference<Expense>;
        const splitRef = doc(collection(this.fs, `/groups/${groupId}/splits`));
        batch.set(splitRef, split);
      });

      await batch.commit();
    } catch (error) {
      // Clean up uploaded receipt if batch commit fails
      if (receipt) {
        const storageRef = ref(
          this.storage,
          `groups/${groupId}/receipts/${expenseRef.id}`
        );
        deleteObject(storageRef).catch((deleteError) => {
          this.analytics.logEvent('delete_receipt_after_batch_failure', {
            error:
              deleteError instanceof Error
                ? deleteError.message
                : 'Unknown error',
          });
        });
      }

      this.analytics.logError(
        'Expense Service',
        'updateExpense',
        'Failed to update expense',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async deleteExpense(
    groupId: string,
    expenseRef: DocumentReference<Expense>
  ): Promise<void> {
    const expenseDoc = await getDoc(expenseRef);
    const receiptPath: string | undefined =
      (expenseDoc.exists() && expenseDoc.data()?.receiptPath) || undefined;

    const batch = writeBatch(this.fs);

    // Delete associated splits
    const splitQuery = query(
      collection(this.fs, `/groups/${groupId}/splits/`),
      where('expenseRef', '==', expenseRef)
    );
    const queryDocs = await getDocs(splitQuery);
    queryDocs.forEach((d) => {
      batch.delete(d.ref);
    });

    // Delete the expense
    batch.delete(expenseRef);

    await batch.commit();

    // Delete receipt from storage if it exists
    if (receiptPath) {
      const receiptRef = ref(this.storage, receiptPath);
      deleteObject(receiptRef).catch((error) => {
        this.analytics.logEvent('delete_receipt_error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }
  }

  /**
   * Check if a group has any expenses
   * Used to determine if currency can be changed
   */
  async hasExpensesForGroup(groupId: string): Promise<boolean> {
    try {
      const q = query(
        collection(this.fs, `groups/${groupId}/expenses`),
        limit(1)
      );
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      this.analytics.logError(
        'Expense Service',
        'has_expenses_for_group',
        'Failed to check if group has expenses',
        error instanceof Error ? error.message : 'Unknown error'
      );
      // If there's an error, assume expenses exist to be safe
      return true;
    }
  }
}
