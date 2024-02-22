import { Component } from '@angular/core';
import { UserService } from '@services/user.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'Cost Sharing';

  constructor(public user: UserService) {}

  ngOnInit(): void {}

  logout(): void {
    this.user.logout();
  }
}
