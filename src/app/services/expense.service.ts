import { inject, Injectable } from '@angular/core';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
import { ExpenseStore } from '@store/expense.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
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
import { deleteObject, getStorage, ref, uploadBytes } from 'firebase/storage';
import { CategoryService } from './category.service';
import { IExpenseService } from './expense.service.interface';

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
    // Get splits
    let splitQuery = query(collection(this.fs, `groups/${groupId}/splits`));
    if (startDate) {
      splitQuery = query(splitQuery, where('date', '>=', startDate));
    }
    if (endDate) {
      splitQuery = query(splitQuery, where('date', '<=', endDate));
    }
    const splitSnap = await getDocs(splitQuery);
    const splits = splitSnap.docs.map(
      (doc) =>
        new Split({
          id: doc.id,
          ...doc.data(),
          ref: doc.ref as DocumentReference<Split>,
        })
    );

    // Get expenses
    let expenseQuery = query(collection(this.fs, `groups/${groupId}/expenses`));
    if (startDate) {
      expenseQuery = query(expenseQuery, where('date', '>=', startDate));
    }
    if (endDate) {
      expenseQuery = query(expenseQuery, where('date', '<=', endDate));
    }
    expenseQuery = query(expenseQuery, orderBy('date'));
    const expenseSnap = await getDocs(expenseQuery);

    // Get category map
    const categoryMap = await this.categoryService.getCategoryMap(groupId);

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
  }

  async getExpense(groupId: string, expenseId: string): Promise<Expense> {
    const expenseReference = doc(
      this.fs,
      `groups/${groupId}/expenses/${expenseId}`
    );
    const expenseDoc = await getDoc(expenseReference);
    if (!expenseDoc.exists()) {
      throw new Error('Expense not found');
    }
    const expense = new Expense({
      id: expenseDoc.id,
      ...expenseDoc.data(),
      ref: expenseDoc.ref as DocumentReference<Expense>,
    });
    const splitQuery = query(
      collection(this.fs, `/groups/${groupId}/splits/`),
      where('expenseRef', '==', expenseReference as DocumentReference<Expense>)
    );
    const splitDocs = await getDocs(splitQuery);
    expense.splits = splitDocs.docs.map(
      (doc) => ({ id: doc.id, ...doc.data(), ref: doc.ref }) as Split
    );
    return expense;
  }

  async addExpense(
    groupId: string,
    expense: Partial<Expense>,
    splits: Partial<Split>[],
    receipt: File | null = null
  ): Promise<DocumentReference<Expense> | Error> {
    const batch = writeBatch(this.fs);
    const expenseRef = doc(collection(this.fs, `/groups/${groupId}/expenses`));
    if (receipt) {
      const storageRef = ref(
        this.storage,
        `groups/${groupId}/receipts/${expenseRef.id}`
      );
      expense.receiptPath = storageRef.fullPath; // Store the path as a string
      await uploadBytes(storageRef, receipt).then(() => {
        logEvent(this.analytics, 'receipt_uploaded');
      });
    }
    batch.set(expenseRef, expense);
    splits.forEach((split) => {
      split.expenseRef = expenseRef as DocumentReference<Expense>;
      const splitRef = doc(collection(this.fs, `/groups/${groupId}/splits`));
      batch.set(splitRef, split);
    });
    return await batch
      .commit()
      .then(() => {
        return expenseRef as DocumentReference<Expense>;
      })
      .catch((err: Error) => {
        if (receipt) {
          const storageRef = ref(
            this.storage,
            `groups/${groupId}/receipts/${expenseRef.id}`
          );
          // Attempt to delete the uploaded receipt if batch commit fails
          deleteObject(storageRef).catch((error) => {
            logEvent(this.analytics, 'delete_receipt_error', {
              error: error.message,
            });
          });
        }
        return new Error(err.message);
      });
  }

  async updateExpense(
    groupId: string,
    expenseRef: DocumentReference<Expense>,
    changes: Partial<Expense>,
    splits: Partial<Split>[],
    receipt: File | null = null
  ): Promise<any> {
    if (receipt) {
      const storageRef = ref(
        this.storage,
        `groups/${groupId}/receipts/${expenseRef.id}`
      );
      try {
        await uploadBytes(storageRef, receipt);
        changes.receiptPath = storageRef.fullPath; // Store the path as a string
        logEvent(this.analytics, 'receipt_uploaded');
      } catch (error) {
        logEvent(this.analytics, 'receipt_upload_failed', {
          error: error.message,
        });
        return new Error('Failed to upload receipt');
      }
    }

    const batch = writeBatch(this.fs);
    batch.update(expenseRef, changes);
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
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        // If batch commit fails and we uploaded a new receipt, clean it up
        if (receipt) {
          const storageRef = ref(
            this.storage,
            `groups/${groupId}/receipts/${expenseRef.id}`
          );
          deleteObject(storageRef).catch((error) => {
            logEvent(this.analytics, 'delete_receipt_after_batch_failure', {
              error: error.message,
            });
          });
        }
        return new Error(err.message);
      });
  }

  async deleteExpense(
    groupId: string,
    expenseRef: DocumentReference<Expense>
  ): Promise<any> {
    const expenseDoc = await getDoc(expenseRef);
    const receiptPath: string | undefined =
      expenseDoc.exists() && expenseDoc.data()?.receiptPath;
    const batch = writeBatch(this.fs);
    const splitQuery = query(
      collection(this.fs, `/groups/${groupId}/splits/`),
      where('expenseRef', '==', expenseRef)
    );
    const queryDocs = await getDocs(splitQuery);
    queryDocs.forEach((d) => {
      batch.delete(d.ref);
    });
    batch.delete(expenseRef);
    return await batch
      .commit()
      .then(() => {
        // If the expense had a receipt, delete it from storage
        if (receiptPath) {
          const receiptRef = ref(this.storage, receiptPath);
          deleteObject(receiptRef).catch((error) => {
            logEvent(this.analytics, 'delete_receipt_error', {
              error: error.message,
            });
          });
        }
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  // Utilities for data integrity and migration

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
