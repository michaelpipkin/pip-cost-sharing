import { Component, inject, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { Member } from '@models/member';
import { User } from '@models/user';
import { DemoService } from '@services/demo.service';
import { MemberService } from '@services/member.service';
import { LoadingService } from '@shared/loading/loading.service';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

@Component({
  selector: 'app-join-group',
  templateUrl: './join-group.component.html',
  styleUrl: './join-group.component.scss',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
})
export class JoinGroupComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly dialogRef = inject(MatDialogRef<JoinGroupComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly demoService = inject(DemoService);
  protected readonly memberService = inject(MemberService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);

  joinGroupForm = this.fb.group({
    groupId: ['', Validators.required],
    displayName: ['', Validators.required],
  });

  user: Signal<User> = this.userStore.user;

  public get f() {
    return this.joinGroupForm.controls;
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    this.loading.loadingOn();
    const val = this.joinGroupForm.value;
    const newMember: Partial<Member> = {
      userRef: this.user().ref,
      displayName: val.displayName,
      email: this.user().email,
      active: true,
      groupAdmin: false,
    };
    try {
      await this.memberService.addMemberToGroup(val.groupId, newMember);
      this.dialogRef.close(true);
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'join_group',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Something went wrong - could not join group. Please check the group code' },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
