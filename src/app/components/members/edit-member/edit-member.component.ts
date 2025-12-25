import { Component, inject, Signal } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
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
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Member } from '@models/member';
import { User } from '@models/user';
import { DemoService } from '@services/demo.service';
import { MemberService } from '@services/member.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { LoadingService } from '@shared/loading/loading.service';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';

@Component({
  selector: 'app-edit-member',
  templateUrl: './edit-member.component.html',
  styleUrl: './edit-member.component.scss',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
})
export class EditMemberComponent {
  protected readonly dialogRef = inject(MatDialogRef<EditMemberComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly dialog = inject(MatDialog);
  protected readonly userStore = inject(UserStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly memberService = inject(MemberService);
  protected readonly demoService = inject(DemoService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly data: any = inject(MAT_DIALOG_DATA);

  private member: Member = this.data.member;

  editMemberForm: FormGroup;

  currentMember: Signal<Member> = this.memberStore.currentMember;
  user: Signal<User> = this.userStore.user;

  groupAdminTooltip: string = '';

  constructor() {
    this.editMemberForm = this.fb.group({
      memberName: [this.member.displayName, Validators.required],
      email: [this.member.email, Validators.email],
      active: [this.member.active],
      groupAdmin: [
        {
          value: this.member.groupAdmin,
          disabled: this.member.userRef?.eq(this.user().ref),
        },
      ],
    });
    if (this.member.userRef?.eq(this.user().ref)) {
      this.groupAdminTooltip = 'You cannot remove yourself as a group admin';
    }
  }

  public get f() {
    return this.editMemberForm.controls;
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    try {
      this.loading.loadingOn();
      const form = this.editMemberForm.getRawValue();
      const changes: Partial<Member> = {
        displayName: form.memberName,
        email: form.email,
        active: form.active,
        groupAdmin: form.groupAdmin,
      };
      await this.memberService.updateMember(this.member.ref, changes);
      this.dialogRef.close({
        success: true,
        operation: 'saved',
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'edit_member',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Something went wrong - could not edit member' },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  removeMember(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        operation: 'Remove',
        target: `member: ${this.member.displayName}`,
      },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          await this.memberService.removeMemberFromGroup(
            this.data.groupId,
            this.member.ref
          );
          this.dialogRef.close({
            success: true,
            operation: 'removed',
          });
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'remove_member',
              message: error.message,
            });
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: 'Something went wrong - could not remove member' },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }
}
