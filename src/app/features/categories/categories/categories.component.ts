import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MatDialog,
  MatDialogConfig,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import {
  GUIDED_TOUR_DIALOG_CONFIG,
  GuidedTourDialogs,
} from '@services/guided-tour-dialogs';
import { GuidedTourService } from '@services/guided-tour.service';
import { SortingService } from '@services/sorting.service';
import { ActiveInactivePipe } from '@shared/pipes/active-inactive.pipe';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { AddCategoryComponent } from '../add-category/add-category.component';
import { EditCategoryComponent } from '../edit-category/edit-category.component';
import { buildCategoriesTourSteps } from './categories.tour';

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.scss',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatTableModule,
    MatSortModule,
    MatCardModule,
    ActiveInactivePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesComponent {
  protected readonly router = inject(Router);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly sorter = inject(SortingService);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly guidedTour = inject(GuidedTourService);

  currentMember: Signal<Member | null> = this.memberStore.currentMember;
  currentGroup: Signal<Group | null> = this.groupStore.currentGroup;
  // Sample categories the guided tour shows a group that only has Default.
  // Held here, never in the store, and cleared when the tour ends.
  protected readonly tourSample = signal<Category[] | null>(null);
  categories: Signal<Category[]> = computed(
    () => this.tourSample() ?? this.categoryStore.groupCategories()
  );
  readonly #tourDialogs = new GuidedTourDialogs<'add' | 'edit'>();

  sortField = signal<string>('name');
  sortAsc = signal<boolean>(true);
  displayedColumns = signal<string[]>(['name', 'active']);

  activeOnly = model<boolean>(true);
  nameFilter = model<string>('');

  filteredCategories = computed(() => {
    const nameFilter = this.nameFilter().toLowerCase();
    let categories = this.categories().filter(
      (c: Category) =>
        (c.active || !this.activeOnly()) &&
        c.name.toLowerCase().includes(nameFilter)
    );
    if (categories.length > 0) {
      categories = this.sorter.sort(
        categories,
        this.sortField(),
        this.sortAsc()
      );
    }
    return categories;
  });

  constructor() {
    // Leaving the page mid-tour ends it (and clears what it changed)
    inject(DestroyRef).onDestroy(() => this.guidedTour.stop('closed'));

    effect(() => {
      if (this.categoryStore.loaded()) {
        this.loading.loadingOff();
      } else {
        this.loading.loadingOn();
      }
    });
  }

  sortCategories(e: { active: string; direction: string }): void {
    this.sortField.set(e.active);
    this.sortAsc.set(e.direction === 'asc');
  }

  addCategory(forTour = false): MatDialogRef<AddCategoryComponent> {
    const dialogConfig: MatDialogConfig = {
      ...(forTour ? GUIDED_TOUR_DIALOG_CONFIG : {}),
      data: this.currentGroup()!.id,
    };
    const dialogRef = this.dialog.open(AddCategoryComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Category added' },
        });
      }
    });
    return dialogRef;
  }

  onRowClick(category: Category): void {
    if (this.currentMember()?.groupAdmin) {
      this.editCategory(category);
    }
  }

  editCategory(
    category: Category,
    forTour = false
  ): MatDialogRef<EditCategoryComponent> {
    const dialogConfig: MatDialogConfig = {
      ...(forTour ? GUIDED_TOUR_DIALOG_CONFIG : {}),
      data: { category },
    };
    const dialogRef = this.dialog.open(EditCategoryComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: `Category ${result.operation}` },
        });
      }
    });
    return dialogRef;
  }

  /**
   * Starts the guided tour. A group with only the Default category sees a
   * few sample categories; the tour also opens Add and Edit Category to walk
   * through them, and puts everything back when it ends.
   */
  startTour(): void {
    const previousActiveOnly = this.activeOnly();
    const real = this.categoryStore.groupCategories();
    if (real.length <= 1) {
      this.tourSample.set([...real, ...this.#tourSampleCategories()]);
    }

    this.guidedTour.start({
      id: 'categories',
      steps: buildCategoriesTourSteps({
        usingSample: () => this.tourSample() !== null,
        isAdmin: () => !!this.currentMember()?.groupAdmin,
        showInactive: () => this.activeOnly.set(false),
        openAddCategory: () =>
          this.#tourDialogs.open('add', () => this.addCategory(true)),
        openEditCategory: () =>
          this.#tourDialogs.open('edit', () =>
            this.editCategory(this.filteredCategories()[0]!, true)
          ),
        closeDialogs: () => this.#tourDialogs.close(),
      }),
      onEnd: () => {
        this.#tourDialogs.close();
        this.tourSample.set(null);
        this.activeOnly.set(previousActiveOnly);
      },
      fullHelp: () => this.showHelp(),
    });
  }

  #tourSampleCategories(): Category[] {
    const sample = (name: string, active = true) =>
      new Category({
        id: `tour-sample-${name.toLowerCase().replace(/\W+/g, '-')}`,
        name,
        active,
      });
    return [
      sample('Groceries'),
      sample('Dining Out'),
      sample('Utilities'),
      sample('Gas'),
      sample('Old Car', false),
    ];
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'categories' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }
}
