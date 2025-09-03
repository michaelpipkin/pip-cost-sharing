import { inject, Injectable } from '@angular/core';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
import { ExpenseStore } from '@store/expense.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { deleteObject, getStorage, ref, uploadBytes } from 'firebase/storage';
import { CategoryService } from './category.service';
import { IExpenseService } from './expense.service.interface';
import {
  collection,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class ExpenseService implements IExpenseService {
  protected readonly fs = inject(getFirestore);
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(getAnalytics);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly categoryService = inject(CategoryService);

  async getGroupExpensesByDateRange(
    groupId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Expense[]> {
    try {
      // Build split query
      let splitQuery = query(collection(this.fs, `groups/${groupId}/splits`));
      if (startDate) {
        splitQuery = query(splitQuery, where('date', '>=', startDate));
      }
      if (endDate) {
        splitQuery = query(splitQuery, where('date', '<=', endDate));
      }

      // Build expense query
      let expenseQuery = query(collection(this.fs, `groups/${groupId}/expenses`));
      if (startDate) {
        expenseQuery = query(expenseQuery, where('date', '>=', startDate));
      }
      if (endDate) {
        expenseQuery = query(expenseQuery, where('date', '<=', endDate));
      }
      expenseQuery = query(expenseQuery, orderBy('date'));

      // Execute all queries in parallel
      const [splitSnap, expenseSnap, categoryMap] = await Promise.all([
        getDocs(splitQuery),
        getDocs(expenseQuery),
        this.categoryService.getCategoryMap(groupId),
      ]);

      // Process splits
      const splits = splitSnap.docs.map(
        (doc) =>
          new Split({
            id: doc.id,
            ...doc.data(),
            ref: doc.ref as DocumentReference<Split>,
          })
      );

      // Build and return expenses
      const expenses = expenseSnap.docs.map((doc) => {
        const data = doc.data();
        return new Expense({
          id: doc.id,
          ...data,
          ref: doc.ref as DocumentReference<Expense>,
          categoryName: data.categoryRef
            ? categoryMap.get(data.categoryRef.id) || 'Unknown Category'
            : '',
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
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getExpense(groupId: string, expenseId: string): Promise<Expense> {
    try {
      const expenseReference = doc(
        this.fs,
        `groups/${groupId}/expenses/${expenseId}`
      );

      // Build split query
      const splitQuery = query(
        collection(this.fs, `/groups/${groupId}/splits/`),
        where('expenseRef', '==', expenseReference as DocumentReference<Expense>)
      );

      // Execute both queries in parallel
      const [expenseDoc, splitDocs] = await Promise.all([
        getDoc(expenseReference),
        getDocs(splitQuery),
      ]);

      if (!expenseDoc.exists()) {
        throw new Error('Expense not found');
      }

      const expense = new Expense({
        id: expenseDoc.id,
        ...expenseDoc.data(),
        ref: expenseDoc.ref as DocumentReference<Expense>,
      });

      expense.splits = splitDocs.docs.map(
        (doc) => ({ id: doc.id, ...doc.data(), ref: doc.ref }) as Split
      );

      return expense;
    } catch (error) {
      logEvent(this.analytics, 'error', {
        service: 'ExpenseService',
        method: 'getExpense',
        message: 'Failed to get expense',
        groupId,
        expenseId,
        error: error instanceof Error ? error.message : 'Unknown error'
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
            error: deleteError instanceof Error ? deleteError.message : 'Unknown error',
          });
        });
      }
      
      logEvent(this.analytics, 'error', {
        service: 'ExpenseService',
        method: 'addExpense',
        message: 'Failed to add expense',
        groupId,
        error: error instanceof Error ? error.message : 'Unknown error'
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
            error: deleteError instanceof Error ? deleteError.message : 'Unknown error',
          });
        });
      }
      
      logEvent(this.analytics, 'error', {
        service: 'ExpenseService',
        method: 'updateExpense',
        message: 'Failed to update expense',
        groupId,
        expenseId: expenseRef.id,
        error: error instanceof Error ? error.message : 'Unknown error'
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
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
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
