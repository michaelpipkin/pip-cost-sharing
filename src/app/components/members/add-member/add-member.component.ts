import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Member } from '@models/member';
import { DemoService } from '@services/demo.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { LoadingService } from '@shared/loading/loading.service';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';

@Component({
  selector: 'app-add-member',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './add-member.component.html',
  styleUrl: './add-member.component.scss',
})
export class AddMemberComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly dialogRef = inject(MatDialogRef<AddMemberComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly memberService = inject(MemberService);
  protected readonly groupService = inject(GroupService);
  protected readonly demoService = inject(DemoService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly data: any = inject(MAT_DIALOG_DATA);

  addMemberForm = this.fb.group({
    displayName: ['', Validators.required],
    email: ['', Validators.email],
  });

  public get f() {
    return this.addMemberForm.controls;
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    try {
      this.loading.loadingOn();
      const val = this.addMemberForm.value;
      const newMember: Partial<Member> = {
        userRef: null,
        displayName: val.displayName,
        email: val.email,
        active: true,
        groupAdmin: false,
      };
      await this.memberService.addManualMemberToGroup(
        this.data.groupId,
        newMember
      );
      this.dialogRef.close(true);
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'add_member',
          message: error.message,
        });
      } else {
        this.snackBar.open(
          'Something went wrong - could not add member.',
          'Close'
        );
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
