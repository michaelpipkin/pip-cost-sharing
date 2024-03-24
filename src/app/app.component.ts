import { Component } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { SplitService } from '@services/split.service';
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
    private splitsService: SplitService
  ) {}

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
