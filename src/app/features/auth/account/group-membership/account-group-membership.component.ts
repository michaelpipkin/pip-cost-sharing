import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Signal,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmDialogComponent } from '@components/confirm-dialog/confirm-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { Group } from '@models/group';
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { MemberService } from '@services/member.service';
import { GroupStore } from '@store/group.store';
import { DocumentReference } from 'firebase/firestore';

@Component({
  selector: 'app-account-group-membership',
  templateUrl: './account-group-membership.component.html',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    DocRefCompareDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountGroupMembershipComponent {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberService = inject(MemberService);
  protected readonly demoService = inject(DemoService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);

  leftUserGroups: Signal<Group[]> = this.groupStore.leftUserGroups;

  protected readonly selectedGroupRef =
    signal<DocumentReference<Group> | null>(null);

  protected readonly selectedGroup = computed<Group | null>(() => {
    const ref = this.selectedGroupRef();
    if (!ref) return null;
    return this.leftUserGroups().find((g) => g.ref?.eq(ref)) ?? null;
  });

  rejoinGroup(): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const group = this.selectedGroup();
    if (!group?.userMemberRef) return;

    const dialogConfig: MatDialogConfig = {
      data: {
        dialogTitle: 'Confirm Rejoining Group',
        confirmationText: `Are you sure you want to rejoin "${group.name}"? You will regain access to the group's expenses.`,
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Rejoin',
      },
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (!confirm) return;
      try {
        this.loading.loadingOn();
        await this.memberService.rejoinGroup(group.userMemberRef!);
        this.selectedGroupRef.set(null);
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: `You have rejoined "${group.name}".` },
        });
      } catch (error) {
        if (error instanceof Error) {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: error.message },
          });
          this.analytics.logError(
            'Account Group Membership Component',
            'rejoin_group',
            error.message
          );
        } else {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: {
              message: 'Something went wrong - could not rejoin the group',
            },
          });
        }
      } finally {
        this.loading.loadingOff();
      }
    });
  }
}
