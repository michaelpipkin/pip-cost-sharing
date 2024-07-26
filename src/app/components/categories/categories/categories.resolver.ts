import { inject } from '@angular/core';
import { Category } from '@models/category';
import { CategoryService } from '@services/category.service';
import {
  ActivatedRouteSnapshot,
  ResolveFn,
  RouterStateSnapshot,
} from '@angular/router';

export const categoriesResolver: ResolveFn<Category[]> = (
  _route: ActivatedRouteSnapshot,
  _state: RouterStateSnapshot
) => {
  const categoryService = inject(CategoryService);
  return categoryService.groupCategories();
};
