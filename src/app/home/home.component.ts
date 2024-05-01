import { Component, OnInit } from '@angular/core';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  constructor(
    public userService: UserService,
    public groupService: GroupService
  ) {}

  ngOnInit(): void {
    this.userService.isLoggedIn$.subscribe((loggedIn) => {
      if (loggedIn) {
        const user = this.userService.getCurrentUser();
        this.groupService.getGroupsForUser(user.uid).subscribe();
      }
    });
  }
}
