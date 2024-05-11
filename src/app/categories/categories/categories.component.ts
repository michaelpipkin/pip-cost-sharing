import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import {
  MatFormField,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortHeader } from '@angular/material/sort';
import { Router } from '@angular/router';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { CategoryService } from '@services/category.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SortingService } from '@services/sorting.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import { ActiveInactivePipe } from '@shared/pipes/active-inactive.pipe';
import firebase from 'firebase/compat/app';
import { map, Observable, tap } from 'rxjs';
import { AddCategoryComponent } from '../add-category/add-category.component';
import { EditCategoryComponent } from '../edit-category/edit-category.component';
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
  currentUser: firebase.User;
  currentGroup: Group;
  currentMember: Member;
  categories$: Observable<Category[]>;
  filteredCategories$: Observable<Category[]>;
  activeOnly: boolean = false;
  nameFilter: string = '';
  sortField: string = 'name';
  sortAsc: boolean = true;
  columnsToDisplay: string[] = ['name', 'active'];

  constructor(
    private router: Router,
    private userService: UserService,
    private groupService: GroupService,
    private memberService: MemberService,
    private categorySerice: CategoryService,
    private sorter: SortingService,
    private dialog: MatDialog,
    private loading: LoadingService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    if (this.groupService.getCurrentGroup() == null) {
      this.router.navigateByUrl('/groups');
    } else {
      this.currentUser = this.userService.getCurrentUser();
      this.currentGroup = this.groupService.getCurrentGroup();
      this.currentMember = this.memberService.getCurrentGroupMember();
      this.activeOnly = false;
      this.nameFilter = '';
      this.loadCategories();
      this.filterCategories();
    }
  }

  loadCategories(): void {
    this.loading.loadingOn();
    this.categories$ = this.categorySerice
      .getCategoriesForGroup(this.currentGroup.id)
      .pipe(tap(() => this.loading.loadingOff()));
  }

  filterCategories(): void {
    this.filteredCategories$ = this.categories$.pipe(
      map((categories: Category[]) => {
        let filteredCategories: Category[] = categories.filter(
          (category: Category) =>
            (category.active || category.active == this.activeOnly) &&
            category.name.toLowerCase().includes(this.nameFilter.toLowerCase())
        );
        if (filteredCategories.length > 0) {
          filteredCategories = this.sorter.sort(
            filteredCategories,
            this.sortField,
            this.sortAsc
          );
        }
        return filteredCategories;
      })
    );
  }

  sortCategories(e: { active: string; direction: string }): void {
    this.sortField = e.active;
    this.sortAsc = e.direction == 'asc';
    this.filterCategories();
  }

  clearSearch(): void {
    this.nameFilter = '';
    this.filterCategories();
  }

  addCategory(): void {
    const dialogConfig: MatDialogConfig = {
      data: this.currentGroup.id,
    };
    const dialogRef = this.dialog.open(AddCategoryComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((success) => {
      if (success) {
        this.snackBar.open('Category added', 'OK');
      }
    });
  }

  onRowClick(category: Category): void {
    if (this.currentMember.groupAdmin) {
      const dialogConfig: MatDialogConfig = {
        data: {
          category: category,
          groupId: this.currentGroup.id,
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
