import { Component, Inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category } from '@models/category';
import { CategoryService } from '@services/category.service';
import { catchError, map, tap, throwError } from 'rxjs';

@Component({
  selector: 'app-add-category',
  templateUrl: './add-category.component.html',
  styleUrl: './add-category.component.scss',
})
export class AddCategoryComponent {
  newCategoryForm = this.fb.group({
    categoryName: ['', Validators.required],
  });

  constructor(
    private dialogRef: MatDialogRef<AddCategoryComponent>,
    private fb: FormBuilder,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public groupId: string
  ) {}

  public get f() {
    return this.newCategoryForm.controls;
  }

  onSubmit(): void {
    this.newCategoryForm.disable();
    const categoryName = this.newCategoryForm.value.categoryName;
    const newCategory: Partial<Category> = {
      name: categoryName,
      groupId: this.groupId,
      active: true,
    };
    this.categoryService
      .addCategory(this.groupId, newCategory)
      .pipe(
        map((res) => {
          if (res.name === 'Error') {
            this.snackBar.open(res.message, 'Close');
            this.newCategoryForm.enable();
          } else {
            this.dialogRef.close(true);
          }
        }),
        catchError((err: Error) => {
          this.snackBar.open(
            'Something went wrong - could not add category.',
            'Close'
          );
          this.newCategoryForm.enable();
          return throwError(() => new Error(err.message));
        })
      )
      .subscribe();
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
