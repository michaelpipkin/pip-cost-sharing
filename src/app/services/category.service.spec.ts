import { TestBed } from '@angular/core/testing';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { FirestoreModule, provideFirestore } from '@angular/fire/firestore';
import { CategoryService } from './category.service';
import { SortingService } from './sorting.service';
import { firestore } from '../../../firestore-setup';
import { FirebaseConfig } from '../firebase.config';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
} from '@angular/fire/firestore';

describe('CategoryService', () => {
  let service: CategoryService;
  const groupId = 'test-group';

  beforeAll(async () => {
    TestBed.configureTestingModule({
      imports: [FirestoreModule],
      providers: [
        CategoryService,
        SortingService,
        provideFirebaseApp(() => initializeApp(FirebaseConfig)),
        provideFirestore(() => firestore),
      ],
    });

    service = TestBed.inject(CategoryService);
    // Start the onSnapshot listener
    service.getGroupCategories(groupId);
    // Clean up any existing data
    const categoriesRef = collection(firestore, `groups/${groupId}/categories`);
    const snapshot = await getDocs(categoriesRef);
    snapshot.forEach(async (docSnap) => {
      await deleteDoc(doc(categoriesRef, docSnap.id));
    });
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should add a category', async () => {
    const category = { name: 'New Category' };

    const result = await service.addCategory(groupId, category);
    expect(result).not.toBeInstanceOf(Error);

    const categoriesRef = collection(firestore, `groups/${groupId}/categories`);
    const snapshot = await getDocs(
      query(categoriesRef, where('name', '==', category.name))
    );
    expect(snapshot.size).toBe(1);
  });

  it('should get group categories', async () => {
    const categoriesRef = collection(firestore, `groups/${groupId}/categories`);
    await addDoc(categoriesRef, { name: 'Category 1' });
    await addDoc(categoriesRef, { name: 'Category 2' });
    const categories = service.groupCategories();
    expect(categories.length).toBeGreaterThan(0);
    expect(categories[0].name).toBe('Category 1');
    expect(categories[1].name).toBe('Category 2');
  });

  it('should not add a duplicate category', async () => {
    const category = { name: 'Duplicate Category' };

    await service.addCategory(groupId, category);
    const result = await service.addCategory(groupId, category);
    expect(result).toBeInstanceOf(Error);
  });

  it('should update a category', async () => {
    const category = { name: 'Category to Update' };
    const categoriesRef = collection(firestore, `groups/${groupId}/categories`);
    const docRef = await addDoc(categoriesRef, category);

    const changes = { name: 'Updated Category' };
    const result = await service.updateCategory(groupId, docRef.id, changes);
    expect(result).not.toBeInstanceOf(Error);

    const updatedDoc = await getDocs(
      query(categoriesRef, where('name', '==', changes.name))
    );
    expect(updatedDoc.size).toBe(1);
  });

  it('should not update a category to a duplicate name', async () => {
    const category1 = { name: 'Category 1' };
    const category2 = { name: 'Category 2' };
    const categoriesRef = collection(firestore, `groups/${groupId}/categories`);
    const docRef1 = await addDoc(categoriesRef, category1);
    await addDoc(categoriesRef, category2);

    const changes = { name: 'Category 2' };
    const result = await service.updateCategory(groupId, docRef1.id, changes);
    expect(result).toBeInstanceOf(Error);
  });

  it('should delete a category', async () => {
    const category = { name: 'Category to Delete' };
    const categoriesRef = collection(firestore, `groups/${groupId}/categories`);
    const docRef = await addDoc(categoriesRef, category);

    const result = await service.deleteCategory(groupId, docRef.id);
    expect(result).not.toBeInstanceOf(Error);

    const deletedDoc = await getDocs(
      query(categoriesRef, where('name', '==', category.name))
    );
    expect(deletedDoc.size).toBe(0);
  });

  it('should not delete a category assigned to expenses', async () => {
    const category = { name: 'Category with Expenses' };
    const categoriesRef = collection(firestore, `groups/${groupId}/categories`);
    const docRef = await addDoc(categoriesRef, category);

    const expensesRef = collection(firestore, `groups/${groupId}/expenses`);
    await addDoc(expensesRef, { categoryId: docRef.id });

    const result = await service.deleteCategory(groupId, docRef.id);
    expect(result).toBeInstanceOf(Error);
  });
});
