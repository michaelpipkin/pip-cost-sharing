import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category } from '@models/category';
import { CategoryService } from '@services/category.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { LoadingService } from '@shared/loading/loading.service';
import { catchError, map, throwError } from 'rxjs';
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
  loading = inject(LoadingService);
  dialogRef = inject(MatDialogRef<EditCategoryComponent>);
  fb = inject(FormBuilder);
  categoryService = inject(CategoryService);
  dialog = inject(MatDialog);
  snackBar = inject(MatSnackBar);
  analytics = inject(Analytics);
  data: any = inject(MAT_DIALOG_DATA);

  category: Category = this.data.category;

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
      .updateCategory(this.data.groupId, this.category.id, changes)
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
        return throwError(() => new Error(err.message));
      })
      .finally(() => this.loading.loadingOff());
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
        this.loading.loadingOn();
        this.categoryService
          .deleteCategory(this.data.groupId, this.category.id)
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
            return throwError(() => new Error(err.message));
          })
          .finally(() => this.loading.loadingOff());
      }
    });
  }

  close(): void {
    this.dialogRef.close({
      success: false,
    });
  }
}
