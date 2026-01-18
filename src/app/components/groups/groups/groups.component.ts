import {
  afterNextRender,
  Component,
  effect,
  inject,
  Signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { Group } from '@models/group';
import { User } from '@models/user';
import { DemoService } from '@services/demo.service';
import { GroupService } from '@services/group.service';
import { TourService } from '@services/tour.service';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { getAnalytics } from 'firebase/analytics';
import { DocumentReference } from 'firebase/firestore';
import { AddGroupComponent } from '../add-group/add-group.component';
import { ManageGroupsComponent } from '../manage-groups/manage-groups.component';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatTooltipModule,
    MatIconModule,
    MatButtonModule,
    DocRefCompareDirective,
  ],
})
export class GroupsComponent {
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly groupService = inject(GroupService);
  protected readonly loadingService = inject(LoadingService);
  protected readonly memberStore = inject(MemberStore);
  protected readonly demoService = inject(DemoService);
  protected readonly tourService = inject(TourService);
  protected readonly dialog = inject(MatDialog);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly fb = inject(FormBuilder);
  protected readonly analytics = inject(getAnalytics);

  #user: Signal<User> = this.userStore.user;
  #currentGroup: Signal<Group> = this.groupStore.currentGroup;
  allUserGroups: Signal<Group[]> = this.groupStore.allUserGroups;
  activeUserGroups: Signal<Group[]> = this.groupStore.activeUserGroups;

  groupForm = this.fb.group({
    selectedGroupRef: [this.groupStore.currentGroup()?.ref ?? null],
  });

  constructor() {
    effect(() => {
      if (!this.groupStore.loaded()) {
        this.loadingService.loadingOn();
      } else {
        this.loadingService.loadingOff();
      }
    });

    // Patch form value in demo mode
    if (this.demoService.isInDemoMode()) {
      this.groupForm.patchValue({
        selectedGroupRef: this.groupStore.currentGroup()?.ref ?? null,
      });
    }

    afterNextRender(() => {
      // Check if we should auto-start the groups tour
      this.tourService.checkForContinueTour('groups');
    });
  }

  get selectedGroupRef() {
    return this.groupForm.get('selectedGroupRef').value;
  }

  addGroup(): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const dialogRef = this.dialog.open(AddGroupComponent);
    dialogRef
      .afterClosed()
      .subscribe(async (groupRef: DocumentReference<Group>) => {
        if (groupRef) {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Group added' },
          });
          this.groupForm.patchValue({
            selectedGroupRef: this.groupStore.currentGroup()?.ref ?? null,
          });
        }
      });
  }

  async onSelectGroup(e: MatSelectChange): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      // In demo mode, just find and set the group from the store
      const selectedGroup = this.allUserGroups().find(
        (g) => g.ref.id === e.value.id
      );
      if (selectedGroup) {
        this.groupStore.setCurrentGroup(selectedGroup);
      }
      return;
    }
    await this.groupService.getGroup(e.value, this.#user().ref);
  }

  manageGroups(): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const dialogConfig: MatDialogConfig = {
      data: { user: this.#user(), group: this.#currentGroup() },
    };
    const dialogRef = this.dialog.open(ManageGroupsComponent, dialogConfig);
    dialogRef
      .afterClosed()
      .subscribe((result: { success: boolean; operation: string } | false) => {
        if (result && result.success) {
          let message = 'Group updated';
          switch (result.operation) {
            case 'saved':
              message = 'Group updated';
              break;
            case 'archived':
              message = 'Group archived';
              break;
            case 'unarchived':
              message = 'Group restored';
              break;
            case 'deleted':
              message = 'Group deleted';
              break;
          }
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message },
          });
          this.groupForm.patchValue({
            selectedGroupRef: this.groupStore.currentGroup()?.ref ?? null,
          });
        }
      });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'groups' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  startTour(): void {
    // Force start the Welcome Tour (ignoring completion state)
    this.tourService.startWelcomeTour(true);
  }
}
