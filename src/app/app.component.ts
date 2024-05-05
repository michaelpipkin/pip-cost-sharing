import { Component, ElementRef, ViewChild } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { Group } from '@models/group';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { tap } from 'rxjs';
import { HelpComponent } from './help/help.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'Cost Sharing';
  @ViewChild('mainNavbar') navbar: ElementRef;

  constructor(
    public user: UserService,
    public memberService: MemberService,
    public groupService: GroupService,
    private dialog: MatDialog,
    analytics: AngularFireAnalytics
  ) {
    analytics.logEvent('app_initalized');
  }

  ngOnInit(): void {
    this.user.isLoggedIn$.subscribe((loggedIn) => {
      if (loggedIn) {
        const user = this.user.getCurrentUser();
        this.groupService
          .getGroupsForUser(user.uid)
          .pipe(
            tap((groups: Group[]) => {
              if (groups.length === 1) {
                this.memberService
                  .getMemberByUserId(groups[0].id, user.uid)
                  .subscribe();
              }
            })
          )
          .subscribe();
      }
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '90vw',
      maxHeight: '90vh',
    };
    this.dialog.open(HelpComponent, dialogConfig);
  }

  logout(): void {
    this.user.logout();
  }
}
