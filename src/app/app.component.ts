import { Component } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { UserService } from '@services/user.service';
import { HelpComponent } from './help/help/help.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'Cost Sharing';

  constructor(
    public user: UserService,
    private dialog: MatDialog,
    analytics: AngularFireAnalytics
  ) {
    analytics.logEvent('app_initalized');
  }

  ngOnInit(): void {}

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
