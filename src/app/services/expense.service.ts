import { inject, Injectable } from '@angular/core';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
import { ExpenseStore } from '@store/expense.store.';
import {
  collection,
  collectionGroup,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { CategoryService } from './category.service';
import { IExpenseService } from './expense.service.interface';

@Injectable({
  providedIn: 'root',
})
export class ExpenseService implements IExpenseService {
  protected readonly fs = inject(getFirestore);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly categoryService = inject(CategoryService);

  async getExpensesForGroup(groupId: string): Promise<Expense[]> {
    // Get splits first
    const splitQuery = query(collection(this.fs, `groups/${groupId}/splits`));
    const splitSnap = await getDocs(splitQuery);
    const splits = splitSnap.docs.map(
      (doc) => ({ id: doc.id, ...doc.data(), ref: doc.ref }) as Split
    );

    // Get expenses
    const expenseQuery = query(
      collection(this.fs, `groups/${groupId}/expenses`),
      orderBy('date')
    );
    const expenseSnap = await getDocs(expenseQuery);

    // Get category map
    const categoryMap = await this.categoryService.getCategoryMap(groupId);

    // Build and return expenses
    const expenses = expenseSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        ref: doc.ref,
        categoryName: data.categoryRef
          ? categoryMap.get(data.categoryRef.id) || 'Unknown Category'
          : '',
        splits: splits.filter((s) => s.expenseId === doc.id),
      } as Expense;
    });

    return expenses;
  }

  async getExpense(groupId: string, expenseId: string): Promise<Expense> {
    const d = doc(this.fs, `groups/${groupId}/expenses/${expenseId}`);
    const expenseDoc = await getDoc(d);
    if (!expenseDoc.exists()) {
      throw new Error('Expense not found');
    }
    const expense = {
      id: expenseDoc.id,
      ...expenseDoc.data(),
      ref: expenseDoc.ref,
    } as Expense;
    const splitQuery = query(
      collection(this.fs, `/groups/${groupId}/splits/`),
      where('expenseId', '==', expenseId)
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
    splits: Partial<Split>[]
  ): Promise<any> {
    const batch = writeBatch(this.fs);
    const expenseRef = doc(collection(this.fs, `/groups/${groupId}/expenses`));
    batch.set(expenseRef, expense);
    splits.forEach((split) => {
      split.expenseId = expenseRef.id;
      const splitRef = doc(collection(this.fs, `/groups/${groupId}/splits`));
      batch.set(splitRef, split);
    });
    return await batch
      .commit()
      .then(() => {
        return expenseRef.id;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  async updateExpense(
    groupId: string,
    expenseId: string,
    changes: Partial<Expense>,
    splits: Partial<Split>[]
  ): Promise<any> {
    const batch = writeBatch(this.fs);
    batch.update(
      doc(this.fs, `/groups/${groupId}/expenses/${expenseId}`),
      changes
    );
    const splitQuery = query(
      collection(this.fs, `/groups/${groupId}/splits/`),
      where('expenseId', '==', expenseId)
    );
    const queryDocs = await getDocs(splitQuery);
    queryDocs.forEach((d) => {
      batch.delete(d.ref);
    });
    splits.forEach((split) => {
      split.expenseId = expenseId;
      const splitRef = doc(collection(this.fs, `/groups/${groupId}/splits`));
      batch.set(splitRef, split);
    });
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  async deleteExpense(groupId: string, expenseId: string): Promise<any> {
    const batch = writeBatch(this.fs);
    const expenseRef = doc(this.fs, `/groups/${groupId}/expenses/${expenseId}`);
    const splitQuery = query(
      collection(this.fs, `/groups/${groupId}/splits/`),
      where('expenseId', '==', expenseId)
    );
    const queryDocs = await getDocs(splitQuery);
    queryDocs.forEach((d) => {
      batch.delete(d.ref);
    });
    batch.delete(expenseRef);
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  async updateAllExpensesPaidStatus(): Promise<boolean | Error> {
    const batch = writeBatch(this.fs);
    const expenseCollection = collectionGroup(this.fs, 'expenses');
    const splitsCollection = collectionGroup(this.fs, 'splits');
    const expenseDocs = await getDocs(expenseCollection);
    for (const expense of expenseDocs.docs) {
      const splitsQuery = query(
        splitsCollection,
        where('expenseId', '==', expense.id)
      );
      const splitsDocs = await getDocs(splitsQuery);
      const expenseUnpaid =
        splitsDocs.docs.filter((doc) => !doc.data().paid).length > 0;
      batch.update(expense.ref, { paid: !expenseUnpaid });
    }
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  async migrateCategoryIdsToRefs(): Promise<boolean | Error> {
    const batch = writeBatch(this.fs);

    try {
      // Query all expense documents across all groups
      const expensesCollection = collectionGroup(this.fs, 'expenses');
      const expenseDocs = await getDocs(expensesCollection);

      for (const expenseDoc of expenseDocs.docs) {
        const expenseData = expenseDoc.data();

        // Skip if already migrated (no categoryId or categoryRef already exists)
        if (!expenseData.categoryId || expenseData.categoryRef) {
          continue;
        }

        // Extract groupId from the document path
        // Path: groups/{groupId}/expenses/{expenseId}
        const pathSegments = expenseDoc.ref.path.split('/');
        const groupId = pathSegments[1];

        // Create the category document reference
        const categoryRef = doc(
          this.fs,
          `groups/${groupId}/categories/${expenseData.categoryId}`
        );

        // Update the document: add categoryRef and remove categoryId
        batch.update(expenseDoc.ref, {
          categoryRef: categoryRef,
          categoryId: deleteField(), // This removes the field
        });
      }

      return await batch
        .commit()
        .then(() => {
          console.log('Successfully migrated all expense documents');
          return true;
        })
        .catch((err: Error) => {
          console.error('Error migrating expense documents:', err);
          return new Error(err.message);
        });
    } catch (error) {
      console.error('Error during migration:', error);
      return new Error(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }
}
