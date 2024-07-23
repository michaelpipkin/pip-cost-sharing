import { CommonModule } from '@angular/common';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { Auth } from '@angular/fire/auth';
import { MatIconButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import { User } from '@models/user';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import * as firebase from 'firebase/auth';
import {
  Component,
  computed,
  inject,
  model,
  OnInit,
  Signal,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MatError,
  MatFormField,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatOption,
    MatLabel,
    MatSelect,
    MatInput,
    CommonModule,
    MatError,
    MatIconButton,
    MatSuffix,
    MatIcon,
  ],
})
export class ProfileComponent implements OnInit {
  fb = inject(FormBuilder);
  auth = inject(Auth);
  userService = inject(UserService);
  groupService = inject(GroupService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  analytics = inject(Analytics);

  firebaseUser: firebase.User;

  #user: Signal<User> = this.userService.user;

  activeUserGroups: Signal<Group[]> = this.groupService.activeUserGroups;

  selectedGroupId = model<string>(
    this.#user()?.defaultGroupId !== '' ? this.#user().defaultGroupId : ''
  );
  hidePassword = model<boolean>(true);
  hideConfirm = model<boolean>(true);

  emailForm = this.fb.group({
    email: [this.#user().email, Validators.email],
  });
  passwordForm = this.fb.group(
    {
      password: '',
      confirmPassword: '',
    },
    { validators: this.passwordMatchValidator }
  );

  ngOnInit(): void {
    this.firebaseUser = this.auth.currentUser;
  }

  get e() {
    return this.emailForm.controls;
  }

  toggleHidePassword() {
    this.hidePassword.update((h) => !h);
  }

  toggleHideConfirm() {
    this.hideConfirm.update((h) => !h);
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('password').value === g.get('confirmPassword').value
      ? null
      : { mismatch: true };
  }

  async verifyEmail(): Promise<void> {
    firebase
      .sendEmailVerification(this.firebaseUser)
      .then(() => {
        this.snackBar.open(
          'Check your email to verify your email address.',
          'Close',
          {
            verticalPosition: 'top',
          }
        );
      })
      .catch((err: Error) => {
        console.log(err);
        this.snackBar.open(
          'Something went wrong - verification email could not be sent.',
          'Close',
          {
            verticalPosition: 'top',
          }
        );
      });
  }

  onSubmitEmail(): void {
    this.emailForm.disable();
    const newEmail = this.emailForm.value.email;
    if (newEmail !== this.firebaseUser.email) {
      firebase
        .updateEmail(this.firebaseUser, newEmail)
        .then(() => {
          this.snackBar.open('Your email address has been updated.', 'Close', {
            verticalPosition: 'top',
          });
        })
        .catch((err: Error) => {
          console.log(err);
          this.snackBar.open(
            'Something went wrong - your email address could not be updated.',
            'Close',
            {
              verticalPosition: 'top',
            }
          );
        });
    }
    this.emailForm.enable();
  }

  onSubmitPassword(): void {
    this.passwordForm.disable();
    const changes = this.passwordForm.value;
    if (changes.password !== '') {
      firebase
        .updatePassword(this.firebaseUser, changes.password)
        .then(() => {
          this.snackBar.open('Your password has been updated.', 'Close', {
            verticalPosition: 'top',
          });
        })
        .catch(() => {
          this.snackBar.open(
            'Something went wrong - your password could not be updated.',
            'Close',
            {
              verticalPosition: 'top',
            }
          );
        });
    }
    this.passwordForm.enable();
  }

  saveDefaultGroup(): void {
    if (this.selectedGroupId() !== null && this.selectedGroupId() !== '') {
      this.userService
        .saveDefaultGroup(this.selectedGroupId())
        .then(() => {
          this.snackBar.open('Default group updated.', 'Close');
        })
        .catch((err: Error) => {
          logEvent(this.analytics, 'error', {
            component: this.constructor.name,
            action: 'edit_group',
            message: err.message,
          });
          this.snackBar.open(
            'Something went wrong - could not update default group.',
            'Close'
          );
        });
    }
  }
}
