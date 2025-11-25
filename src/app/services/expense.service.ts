import { inject, Injectable } from '@angular/core';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { MemberStore } from '@store/member.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
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
  protected readonly analytics = inject(getAnalytics);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);

  async getGroupExpensesByDateRange(
    groupId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Expense[]> {
    try {
      // Wait for stores to be loaded before processing
      while (!this.categoryStore.loaded() || !this.memberStore.loaded()) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Build split query
      let splitQuery = query(collection(this.fs, `groups/${groupId}/splits`));
      if (startDate) {
        splitQuery = query(splitQuery, where('date', '>=', startDate));
      }
      if (endDate) {
        splitQuery = query(splitQuery, where('date', '<=', endDate));
      }

      // Build expense query
      let expenseQuery = query(
        collection(this.fs, `groups/${groupId}/expenses`)
      );
      if (startDate) {
        expenseQuery = query(expenseQuery, where('date', '>=', startDate));
      }
      if (endDate) {
        expenseQuery = query(expenseQuery, where('date', '<=', endDate));
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
          category: this.categoryStore.getCategoryByRef(data.categoryRef),
          paidByMember: this.memberStore.getMemberByRef(data.paidByMemberRef),
          ref: doc.ref as DocumentReference<Expense>,
          splits: splits.filter((s) => s.expenseRef.eq(doc.ref)),
        });
      });

      return expenses;
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'ExpenseService',
        method: 'getGroupExpensesByDateRange',
        message: 'Failed to get group expenses by date range',
        groupId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
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
        category: this.categoryStore.getCategoryByRef(data.categoryRef),
        paidByMember: this.memberStore.getMemberByRef(data.paidByMemberRef),
        ref: expenseDoc.ref as DocumentReference<Expense>,
      });

      expense.splits = splitDocs.docs.map((doc) => {
        const data = doc.data();
        return new Split({
          id: doc.id,
          ...data,
          category: this.categoryStore.getCategoryByRef(data.categoryRef),
          paidByMember: this.memberStore.getMemberByRef(data.paidByMemberRef),
          owedByMember: this.memberStore.getMemberByRef(data.owedByMemberRef),
          ref: doc.ref as DocumentReference<Split>,
        });
      });

      return expense;
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'ExpenseService',
        method: 'getExpense',
        message: 'Failed to get expense',
        groupId,
        expenseId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async addExpense(
    groupId: string,
    expense: Partial<Expense>,
    splits: Partial<Split>[],
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
        logEvent(this.analytics, 'receipt_uploaded');
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
          logEvent(this.analytics, 'delete_receipt_error', {
            error:
              deleteError instanceof Error
                ? deleteError.message
                : 'Unknown error',
          });
        });
      }

      logEvent(this.analytics, 'error', {
        service: 'ExpenseService',
        method: 'addExpense',
        message: 'Failed to add expense',
        groupId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateExpense(
    groupId: string,
    expenseRef: DocumentReference<Expense>,
    changes: Partial<Expense>,
    splits: Partial<Split>[],
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
          logEvent(this.analytics, 'receipt_uploaded');
        } catch (error) {
          logEvent(this.analytics, 'receipt_upload_failed', {
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
          logEvent(this.analytics, 'delete_receipt_after_batch_failure', {
            error:
              deleteError instanceof Error
                ? deleteError.message
                : 'Unknown error',
          });
        });
      }

      logEvent(this.analytics, 'error', {
        service: 'ExpenseService',
        method: 'updateExpense',
        message: 'Failed to update expense',
        groupId,
        expenseId: expenseRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async deleteExpense(
    groupId: string,
    expenseRef: DocumentReference<Expense>
  ): Promise<void> {
    try {
      const expenseDoc = await getDoc(expenseRef);
      const receiptPath: string | undefined =
        expenseDoc.exists() && expenseDoc.data()?.receiptPath;

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
          logEvent(this.analytics, 'delete_receipt_error', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'ExpenseService',
        method: 'deleteExpense',
        message: 'Failed to delete expense',
        groupId,
        expenseId: expenseRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
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
      logEvent(this.analytics, 'error', {
        component: this.constructor.name,
        action: 'has_expenses_for_group',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      // If there's an error, assume expenses exist to be safe
      return true;
    }
  }

  // Utilities for data integrity and migration

  // async removeHasReceiptField(): Promise<boolean | Error> {
  //   const batch = writeBatch(this.fs);
  //   const expensesCollection = collectionGroup(this.fs, 'expenses');
  //   const expenseDocs = await getDocs(expensesCollection);

  //   for (const expenseDoc of expenseDocs.docs) {
  //     batch.update(expenseDoc.ref, {
  //       hasReceipt: deleteField(),
  //     });
  //   }

  //   return await batch
  //     .commit()
  //     .then(() => {
  //       console.log(
  //         'Successfully removed hasReceipt field from all expense documents'
  //       );
  //       return true;
  //     })
  //     .catch((err: Error) => {
  //       console.error(
  //         'Error removing hasReceipt field from expense documents:',
  //         err
  //       );
  //       return new Error(err.message);
  //     });
  // }

  // async migrateCategoryIdsToRefs(): Promise<boolean | Error> {
  //   const batch = writeBatch(this.fs);

  //   try {
  //     // Query all expense documents across all groups
  //     const expensesCollection = collectionGroup(this.fs, 'expenses');
  //     const expenseDocs = await getDocs(expensesCollection);

  //     for (const expenseDoc of expenseDocs.docs) {
  //       const expenseData = expenseDoc.data();

  //       // Extract groupId from the document path
  //       // Path: groups/{groupId}/expenses/{expenseId}
  //       const pathSegments = expenseDoc.ref.path.split('/');
  //       const groupId = pathSegments[1];

  //       const updates: any = {};

  //       // Migrate categoryId to categoryRef
  //       if (expenseData.categoryId && !expenseData.categoryRef) {
  //         const categoryRef = doc(
  //           this.fs,
  //           `groups/${groupId}/categories/${expenseData.categoryId}`
  //         );
  //         updates.categoryRef = categoryRef;
  //         updates.categoryId = deleteField();
  //       }

  //       // Migrate paidByMemberId to paidByMemberRef
  //       if (expenseData.paidByMemberId && !expenseData.paidByMemberRef) {
  //         const paidByMemberRef = doc(
  //           this.fs,
  //           `groups/${groupId}/members/${expenseData.paidByMemberId}`
  //         );
  //         updates.paidByMemberRef = paidByMemberRef;
  //         updates.paidByMemberId = deleteField();
  //       }

  //       // Only update if there are changes to make
  //       if (Object.keys(updates).length > 0) {
  //         batch.update(expenseDoc.ref, updates);
  //       }
  //     }

  //     return await batch
  //       .commit()
  //       .then(() => {
  //         console.log('Successfully migrated all expense documents');
  //         return true;
  //       })
  //       .catch((err: Error) => {
  //         console.error('Error migrating expense documents:', err);
  //         return new Error(err.message);
  //       });
  //   } catch (error) {
  //     console.error('Error during migration:', error);
  //     return new Error(
  //       error instanceof Error ? error.message : 'Unknown error occurred'
  //     );
  //   }
  // }

  // async migrateReceiptRefToReceiptPath(): Promise<boolean | Error> {
  //   const batch = writeBatch(this.fs);

  //   try {
  //     // Query all expense documents across all groups
  //     const expensesCollection = collectionGroup(this.fs, 'expenses');
  //     const expenseDocs = await getDocs(expensesCollection);

  //     for (const expenseDoc of expenseDocs.docs) {
  //       const expenseData = expenseDoc.data();

  //       // Check if this document has the old receiptRef field
  //       if (expenseData.receiptRef && !expenseData.receiptPath) {
  //         // Extract the storage path from the receiptRef
  //         // receiptRef should be something like "groups/{groupId}/receipts/{expenseId}"
  //         const receiptRef = expenseData.receiptRef;
  //         let receiptPath: string | null = null;

  //         // If receiptRef is a string, use it directly
  //         if (typeof receiptRef === 'string') {
  //           receiptPath = receiptRef;
  //         } else if (
  //           receiptRef &&
  //           typeof receiptRef === 'object' &&
  //           receiptRef._location
  //         ) {
  //           // If it's a StorageReference object with _location
  //           receiptPath = receiptRef._location.path;
  //         } else if (
  //           receiptRef &&
  //           typeof receiptRef === 'object' &&
  //           receiptRef.fullPath
  //         ) {
  //           // If it's a StorageReference object with fullPath
  //           receiptPath = receiptRef.fullPath;
  //         }

  //         if (receiptPath) {
  //           // Update the document: add receiptPath and remove receiptRef
  //           batch.update(expenseDoc.ref, {
  //             receiptPath: receiptPath,
  //             receiptRef: deleteField(), // Remove the old field
  //           });
  //         }
  //       }
  //     }

  //     return await batch
  //       .commit()
  //       .then(() => {
  //         console.log(
  //           'Successfully migrated all expense receiptRef fields to receiptPath'
  //         );
  //         return true;
  //       })
  //       .catch((err: Error) => {
  //         console.error('Error migrating expense receiptRef fields:', err);
  //         return new Error(err.message);
  //       });
  //   } catch (error) {
  //     console.error('Error during receiptRef migration:', error);
  //     return new Error(
  //       error instanceof Error ? error.message : 'Unknown error occurred'
  //     );
  //   }
  // }

  // async updateAllExpensesPaidStatus(): Promise<boolean | Error> {
  //   const batch = writeBatch(this.fs);
  //   const expenseCollection = collectionGroup(this.fs, 'expenses');
  //   const splitsCollection = collectionGroup(this.fs, 'splits');
  //   const expenseDocs = await getDocs(expenseCollection);
  //   for (const expense of expenseDocs.docs) {
  //     const splitsQuery = query(
  //       splitsCollection,
  //       where('expenseId', '==', expense.id)
  //     );
  //     const splitsDocs = await getDocs(splitsQuery);
  //     const expenseUnpaid =
  //       splitsDocs.docs.filter((doc) => !doc.data().paid).length > 0;
  //     batch.update(expense.ref, { paid: !expenseUnpaid });
  //   }
  //   return await batch
  //     .commit()
  //     .then(() => {
  //       return true;
  //     })
  //     .catch((err: Error) => {
  //       return new Error(err.message);
  //     });
  // }
}
