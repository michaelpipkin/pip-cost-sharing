import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Field, form, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category, CategoryForm } from '@models/category';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
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
    Field,
  ],
})
export class AddCategoryComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly dialogRef = inject(MatDialogRef<AddCategoryComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly categoryService = inject(CategoryService);
  protected readonly demoService = inject(DemoService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly groupId: string = inject(MAT_DIALOG_DATA);
  protected form!: CategoryForm;

  protected readonly category = signal<CategoryForm>({
    categoryName: '',
  });
  protected readonly newCategoryForm = form(this.category, (fieldPath) => {
    required(fieldPath.categoryName, { message: '*Required' });
  });

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    try {
      this.loading.loadingOn();
      const formValues = this.newCategoryForm().value();
      const categoryName = formValues.categoryName;
      const newCategory: Partial<Category> = {
        name: categoryName,
        active: true,
      };
      await this.categoryService.addCategory(this.groupId, newCategory);
      this.dialogRef.close(true);
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'add_category',
          message: error.message,
        });
      } else {
        this.snackBar.open(
          'Something went wrong - could not add category.',
          'Close'
        );
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
