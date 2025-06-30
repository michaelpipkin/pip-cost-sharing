import { Category } from '@models/category';
import { DocumentReference } from 'firebase/firestore';

export interface ICategoryService {
  getGroupCategories(groupId: string): void;
  addCategory(groupId: string, category: Partial<Category>): Promise<any>;
  updateCategory(
    categoryRef: DocumentReference<Category>,
    changes: Partial<Category>
  ): Promise<void>;
  deleteCategory(categoryRef: DocumentReference<Category>): Promise<void>;
}
