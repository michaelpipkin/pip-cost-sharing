import { Component } from '@angular/core';
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

  constructor(public user: UserService, private dialog: MatDialog) {}

  ngOnInit(): void {}

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      width: '75vw',
    };
    const dialogRef = this.dialog.open(HelpComponent, dialogConfig);
  }

  logout(): void {
    this.user.logout();
  }
}
