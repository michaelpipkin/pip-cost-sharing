import { Component, Inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category } from '@models/category';
import { CategoryService } from '@services/category.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { catchError, map, throwError } from 'rxjs';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogRef,
} from '@angular/material/dialog';

@Component({
  selector: 'app-edit-category',
  templateUrl: './edit-category.component.html',
  styleUrl: './edit-category.component.scss',
})
export class EditCategoryComponent {
  editCategoryForm = this.fb.group({
    categoryName: [this.category.name, Validators.required],
    active: [this.category.active],
  });

  constructor(
    private dialogRef: MatDialogRef<EditCategoryComponent>,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public category: Category
  ) {}

  public get f() {
    return this.editCategoryForm.controls;
  }

  onSubmit(): void {
    this.editCategoryForm.disable();
    const form = this.editCategoryForm.value;
    const changes: Partial<Category> = {
      name: form.categoryName,
      active: form.active,
    };
    this.categoryService
      .updateCategory(this.category.groupId, this.category.id, changes)
      .pipe(
        map((res) => {
          if (res.name === 'Error') {
            this.snackBar.open(res.message, 'Close');
            this.editCategoryForm.enable();
          } else {
            this.dialogRef.close({
              success: true,
              operation: 'saved',
            });
          }
        }),
        catchError((err: Error) => {
          console.log(err.message);
          this.snackBar.open(
            'Something went wrong - could not edit category.',
            'Close'
          );
          this.editCategoryForm.enable();
          return throwError(() => new Error(err.message));
        })
      )
      .subscribe();
  }

  deleteCategory(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        operation: 'Delete',
        target: `category: ${this.category.name}`,
      },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((confirm) => {
      if (confirm) {
        this.categoryService
          .deleteCategory(this.category.groupId, this.category.id)
          .pipe(
            map((res) => {
              if (res.name === 'Error') {
                this.snackBar.open(res.message, 'Close');
              } else {
                this.dialogRef.close({
                  success: true,
                  operation: 'deleted',
                });
              }
            }),
            catchError((err: Error) => {
              console.log(err.message);
              this.snackBar.open(
                'Something went wrong - could not delete category.',
                'Close'
              );
              return throwError(() => new Error(err.message));
            })
          )
          .subscribe();
      }
    });
  }

  close(): void {
    this.dialogRef.close({
      success: false,
    });
  }
}
