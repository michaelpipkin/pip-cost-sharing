import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category } from '@models/category';
import { CategoryService } from '@services/category.service';
import { SortingService } from '@services/sorting.service';
import { map, Observable } from 'rxjs';
import { AddCategoryComponent } from '../add-category/add-category.component';
import { EditCategoryComponent } from '../edit-category/edit-category.component';

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.scss',
})
export class CategoriesComponent implements OnChanges {
  @Input() groupId: string = '';
  @Input() isGroupAdmin: boolean = false;
  categories$: Observable<Category[]>;
  filteredCategories$: Observable<Category[]>;
  activeOnly: boolean = false;
  nameFilter: string = '';
  sortField: string = 'name';
  sortAsc: boolean = true;
  columnsToDisplay: string[] = ['name', 'active'];

  constructor(
    private categorySerice: CategoryService,
    private sorter: SortingService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.loadCategories();
    this.filterCategories();
  }

  loadCategories(): void {
    this.categories$ = this.categorySerice.getCategoriesForGroup(this.groupId);
  }

  filterCategories(): void {
    this.filteredCategories$ = this.categories$.pipe(
      map((categories: Category[]) => {
        let filteredCategories: Category[] = categories.filter(
          (category: Category) =>
            (category.active || category.active == this.activeOnly) &&
            category.name.toLowerCase().includes(this.nameFilter.toLowerCase())
        );
        if (filteredCategories.length > 0) {
          filteredCategories = this.sorter.sort(
            filteredCategories,
            this.sortField,
            this.sortAsc
          );
        }
        return filteredCategories;
      })
    );
  }

  sortCategories(e: { active: string; direction: string }): void {
    this.sortField = e.active;
    this.sortAsc = e.direction == 'asc';
    this.filterCategories();
  }

  clearSearch(): void {
    this.nameFilter = '';
    this.filterCategories();
  }

  addCategory(): void {
    const dialogConfig: MatDialogConfig = {
      data: this.groupId,
    };
    const dialogRef = this.dialog.open(AddCategoryComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open('Category added', 'OK');
        this.loadCategories();
        this.filterCategories();
      }
    });
  }

  onRowClick(category: Category): void {
    const dialogConfig: MatDialogConfig = {
      data: category,
    };
    const dialogRef = this.dialog.open(EditCategoryComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result) => {
      if (result.success) {
        this.snackBar.open(`Category ${result.operation}`, 'OK');
        this.loadCategories();
        this.filterCategories();
      }
    });
  }
}
