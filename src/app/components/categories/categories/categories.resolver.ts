import { inject } from '@angular/core';
import { Category } from '@models/category';
import { CategoryService } from '@services/category.service';
import { ResolveFn } from '@angular/router';

export const categoriesResolver: ResolveFn<Category[]> = () => {
  const categoryService = inject(CategoryService);
  return categoryService.groupCategories();
};
