import { AsyncPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortHeader } from '@angular/material/sort';
import { Router } from '@angular/router';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { CategoryService } from '@services/category.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SortingService } from '@services/sorting.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import { ActiveInactivePipe } from '@shared/pipes/active-inactive.pipe';
import firebase from 'firebase/compat/app';
import { AddCategoryComponent } from '../add-category/add-category.component';
import { EditCategoryComponent } from '../edit-category/edit-category.component';
import {
  Component,
  computed,
  inject,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import {
  MatFormField,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatNoDataRow,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.scss',
  standalone: true,
  imports: [
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
    CommonModule,
    MatIconButton,
    MatSuffix,
    MatIcon,
    MatSlideToggle,
    MatTable,
    MatSort,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatSortHeader,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatNoDataRow,
    AsyncPipe,
    ActiveInactivePipe,
  ],
})
export class CategoriesComponent implements OnInit {
  router = inject(Router);
  categoryService = inject(CategoryService);
  userService = inject(UserService);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  sorter = inject(SortingService);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);

  user: WritableSignal<User> = this.userService.user;
  currentMember: WritableSignal<Member> = this.memberService.currentGroupMember;
  currentGroup: WritableSignal<Group> = this.groupService.currentGroup;
  categories: WritableSignal<Category[]> = this.categoryService.allCategories;

  activeOnly = signal<boolean>(false);
  nameFilter = signal<string>('');
  sortField = signal<string>('name');
  sortAsc = signal<boolean>(true);

  filteredCategories = computed(() => {
    var categories = this.categories().filter((c: Category) => {
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

  categoryFilterValue: string = '';
  columnsToDisplay: string[] = ['name', 'active'];

  ngOnInit(): void {
    if (this.currentGroup() == null) {
      this.router.navigateByUrl('/groups');
    }
  }

  updateSearch() {
    this.nameFilter.set(this.categoryFilterValue);
  }

  clearSearch(): void {
    this.nameFilter.set('');
    this.categoryFilterValue = '';
  }

  toggleActive(activeOnly: boolean) {
    this.activeOnly.set(activeOnly);
  }

  sortCategories(e: { active: string; direction: string }): void {
    this.sortField.set(e.active);
    this.sortAsc.set(e.direction == 'asc');
  }

  addCategory(): void {
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
    if (this.currentMember().groupAdmin) {
      const dialogConfig: MatDialogConfig = {
        data: {
          category: category,
          groupId: this.currentGroup().id,
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
}
