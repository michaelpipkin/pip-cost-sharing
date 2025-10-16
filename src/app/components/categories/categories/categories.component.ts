import {
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  Signal,
  AfterViewInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { DemoService } from '@services/demo.service';
import { SortingService } from '@services/sorting.service';
import { TourService } from '@services/tour.service';
import { LoadingService } from '@shared/loading/loading.service';
import { ActiveInactivePipe } from '@shared/pipes/active-inactive.pipe';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { AddCategoryComponent } from '../add-category/add-category.component';
import { EditCategoryComponent } from '../edit-category/edit-category.component';

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
    ActiveInactivePipe,
  ],
})
export class CategoriesComponent implements AfterViewInit {
  protected readonly router = inject(Router);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly sorter = inject(SortingService);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly demoService = inject(DemoService);
  protected readonly tourService = inject(TourService);

  currentMember: Signal<Member> = this.memberStore.currentMember;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;
  #categories: Signal<Category[]> = this.categoryStore.groupCategories;

  sortField = signal<string>('name');
  sortAsc = signal<boolean>(true);
  displayedColumns = signal<string[]>(['name', 'active']);

  activeOnly = model<boolean>(true);
  nameFilter = model<string>('');

  filteredCategories = computed(() => {
    var categories = this.#categories().filter((c: Category) => {
      return (
        (c.active || c.active == this.activeOnly()) &&
        c.name.toLowerCase().includes(this.nameFilter().toLowerCase())
      );
    });
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
    effect(() => {
      if (!this.categoryStore.loaded()) {
        this.loading.loadingOn();
      } else {
        this.loading.loadingOff();
      }
    });
  }

  ngAfterViewInit(): void {
    // Check if we should auto-start the categories tour
    this.tourService.checkForContinueTour('categories');
  }

  sortCategories(e: { active: string; direction: string }): void {
    this.sortField.set(e.active);
    this.sortAsc.set(e.direction == 'asc');
  }

  addCategory(): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const dialogConfig: MatDialogConfig = {
      data: this.currentGroup().id,
    };
    const dialogRef = this.dialog.open(AddCategoryComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open('Category added', 'OK');
      }
    });
  }

  onRowClick(category: Category): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    if (this.currentMember().groupAdmin) {
      const dialogConfig: MatDialogConfig = {
        data: {
          category: category,
        },
      };
      const dialogRef = this.dialog.open(EditCategoryComponent, dialogConfig);
      dialogRef.afterClosed().subscribe((result) => {
        if (result.success) {
          this.snackBar.open(`Category ${result.operation}`, 'OK');
        }
      });
    }
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'categories' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  startTour(): void {
    // Force start the Categories Tour (ignoring completion state)
    this.tourService.startCategoriesTour(true);
  }
}
