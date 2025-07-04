import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category } from '@models/category';
import { CategoryService } from '@services/category.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics, logEvent } from 'firebase/analytics';

@Component({
  selector: 'app-edit-category',
  templateUrl: './edit-category.component.html',
  styleUrl: './edit-category.component.scss',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatButtonModule,
  ],
})
export class EditCategoryComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly dialogRef = inject(MatDialogRef<EditCategoryComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly categoryService = inject(CategoryService);
  protected readonly dialog = inject(MatDialog);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly data: { category: Category } = inject(MAT_DIALOG_DATA);

  #category = signal<Category>(this.data.category);

  editCategoryForm = this.fb.group({
    categoryName: [this.data.category.name, Validators.required],
    active: [this.data.category.active],
  });

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
    this.loading.loadingOn();
    this.categoryService
      .updateCategory(this.#category().ref, changes)
      .then((res) => {
        if (res?.name === 'Error') {
          this.snackBar.open(res.message, 'Close');
          this.editCategoryForm.enable();
        } else {
          this.dialogRef.close({
            success: true,
            operation: 'saved',
          });
        }
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'edit_category',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - could not edit category.',
          'Close'
        );
        this.editCategoryForm.enable();
      })
      .finally(() => this.loading.loadingOff());
  }

  deleteCategory(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        operation: 'Delete',
        target: `category: ${this.#category().name}`,
      },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((confirm) => {
      if (confirm) {
        this.loading.loadingOn();
        this.categoryService
          .deleteCategory(this.#category().ref)
          .then((res) => {
            if (res?.name === 'Error') {
              this.snackBar.open(res.message, 'Close');
            } else {
              this.dialogRef.close({
                success: true,
                operation: 'deleted',
              });
            }
          })
          .catch((err: Error) => {
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'delete_category',
              message: err.message,
            });
            this.snackBar.open(
              'Something went wrong - could not delete category.',
              'Close'
            );
          })
          .finally(() => this.loading.loadingOff());
      }
    });
  }
}
