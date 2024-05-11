import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Group } from '@models/group';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { tap } from 'rxjs';
import { HelpComponent } from './help/help.component';
import { FooterComponent } from './shared/footer/footer.component';
import { LoadingComponent } from './shared/loading/loading.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    CommonModule,
    MatIcon,
    LoadingComponent,
    RouterOutlet,
    FooterComponent,
    AsyncPipe,
  ],
})
export class AppComponent {
  title = 'Cost Sharing';
  @ViewChild('mainNavbar') navbar: ElementRef;

  constructor(
    public user: UserService,
    public memberService: MemberService,
    public groupService: GroupService,
    public router: Router,
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
                  .subscribe(() => {
                    this.router.navigateByUrl('/expenses');
                  });
              } else {
                this.router.navigateByUrl('/groups');
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
