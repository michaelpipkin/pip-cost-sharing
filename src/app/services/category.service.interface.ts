import { Category } from '@models/category';

export interface ICategoryService {
  getGroupCategories(groupId: string): void;
  addCategory(groupId: string, category: Partial<Category>): Promise<any>;
  updateCategory(
    groupId: string,
    categoryId: string,
    category: Partial<Category>
  ): Promise<void>;
  deleteCategory(groupId: string, categoryId: string): Promise<void>;
}
