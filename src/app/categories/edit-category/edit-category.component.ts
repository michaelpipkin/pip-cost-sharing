import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogConfig,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category } from '@models/category';
import { CategoryService } from '@services/category.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { catchError, map, throwError } from 'rxjs';

@Component({
  selector: 'app-edit-category',
  templateUrl: './edit-category.component.html',
  styleUrl: './edit-category.component.scss',
  standalone: true,
  imports: [
    MatDialogTitle,
    FormsModule,
    ReactiveFormsModule,
    MatDialogContent,
    MatFormField,
    MatLabel,
    MatInput,
    CommonModule,
    MatError,
    MatSlideToggle,
    MatDialogActions,
  ],
})
export class EditCategoryComponent {
  category: Category;
  editCategoryForm = this.fb.group({
    categoryName: [this.data.category.name, Validators.required],
    active: [this.data.category.active],
  });

  constructor(
    private dialogRef: MatDialogRef<EditCategoryComponent>,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar,
    private analytics: AngularFireAnalytics,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.category = this.data.category;
  }

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
      .updateCategory(this.data.groupId, this.category.id, changes)
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
          this.analytics.logEvent('error', {
            component: this.constructor.name,
            action: 'edit_category',
            message: err.message,
          });
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
          .deleteCategory(this.data.groupId, this.category.id)
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
              this.analytics.logEvent('error', {
                component: this.constructor.name,
                action: 'delete_category',
                message: err.message,
              });
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
