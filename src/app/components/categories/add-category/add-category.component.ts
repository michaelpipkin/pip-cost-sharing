import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category } from '@models/category';
import { CategoryService } from '@services/category.service';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics, logEvent } from 'firebase/analytics';

@Component({
  selector: 'app-add-category',
  templateUrl: './add-category.component.html',
  styleUrl: './add-category.component.scss',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatButtonModule,
    MatInputModule,
  ],
})
export class AddCategoryComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly dialogRef = inject(MatDialogRef<AddCategoryComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly categoryService = inject(CategoryService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly groupId: string = inject(MAT_DIALOG_DATA);

  newCategoryForm = this.fb.group({
    categoryName: ['', Validators.required],
  });

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
    this.loading.loadingOn();
    this.categoryService
      .addCategory(this.groupId, newCategory)
      .then((res) => {
        if (res?.name === 'Error') {
          this.snackBar.open(res.message, 'Close');
          this.newCategoryForm.enable();
        } else {
          this.dialogRef.close(true);
        }
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'add_category',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - could not add category.',
          'Close'
        );
        this.newCategoryForm.enable();
      })
      .finally(() => this.loading.loadingOff());
  }
}
