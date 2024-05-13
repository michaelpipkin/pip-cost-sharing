import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Group } from '@models/group';
import { UserData } from '@models/user-info';
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
    private db: AngularFirestore,
    public user: UserService,
    private memberService: MemberService,
    private groupService: GroupService,
    private router: Router,
    private dialog: MatDialog,
    analytics: AngularFireAnalytics
  ) {
    analytics.logEvent('app_initalized');
  }

  ngOnInit(): void {
    this.user.isLoggedIn$.subscribe((loggedIn) => {
      if (loggedIn) {
        this.user.createUserData();
        const user = this.user.getCurrentUser();
        this.groupService
          .getGroupsForUser(user.uid)
          .pipe(
            tap((groups: Group[]) => {
              var groupId: string = '';
              this.db
                .doc(`users/${user.uid}`)
                .get()
                .pipe(
                  tap((docSnap) => {
                    if (groups.length === 1) {
                      groupId = groups[0].id;
                    } else if (docSnap.exists) {
                      const userData: UserData = docSnap.data() as UserData;
                      groupId = userData.defaultGroupId;
                    }
                    if (groupId !== '') {
                      this.groupService
                        .getGroupById(groupId)
                        .pipe(
                          tap(() => {
                            this.memberService
                              .getMemberByUserId(groupId, user.uid)
                              .subscribe(() => {
                                this.router.navigateByUrl('/expenses');
                              });
                          })
                        )
                        .subscribe();
                    } else {
                      this.router.navigateByUrl('/groups');
                    }
                  })
                )
                .subscribe();
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
