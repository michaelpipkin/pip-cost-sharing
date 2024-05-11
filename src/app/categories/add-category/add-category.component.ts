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
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category } from '@models/category';
import { CategoryService } from '@services/category.service';
import { catchError, map, throwError } from 'rxjs';

@Component({
  selector: 'app-add-category',
  templateUrl: './add-category.component.html',
  styleUrl: './add-category.component.scss',
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
    MatDialogActions,
  ],
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
    private analytics: AngularFireAnalytics,
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
          this.analytics.logEvent('error', {
            component: this.constructor.name,
            action: 'add_category',
            message: err.message,
          });
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
