import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  email as emailValidator,
  form,
  FormField,
  required,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { AddMemberForm, Member } from '@models/member';
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { MemberService } from '@services/member.service';

@Component({
  selector: 'app-add-member',
  imports: [
    FormField,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './add-member.component.html',
  styleUrl: './add-member.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddMemberComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly dialogRef = inject(MatDialogRef<AddMemberComponent>);
  protected readonly memberService = inject(MemberService);
  protected readonly demoService = inject(DemoService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly data: any = inject(MAT_DIALOG_DATA);

  protected readonly addMemberModel = signal<AddMemberForm>({
    displayName: '',
    email: '',
  });
  protected readonly addMemberForm = form(this.addMemberModel, (p) => {
    required(p.displayName, { message: '*Required' });
    emailValidator(p.email, { message: '*Not a valid email address' });
  });

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    try {
      this.loading.loadingOn();
      const val = this.addMemberForm().value();
      const newMember: Partial<Member> = {
        userRef: null,
        displayName: val.displayName,
        email: val.email,
        active: true,
        groupAdmin: false,
      };
      await this.memberService.addMemberToGroup(this.data.groupId, newMember);
      this.analytics.logEvent('member_added_to_group');
      this.dialogRef.close(true);
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Add Member Component',
          'add_member',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Something went wrong - could not add member.' },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
