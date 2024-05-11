import { AsyncPipe, CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { UserService } from '@services/user.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIcon, AsyncPipe],
})
export class HomeComponent {
  constructor(public userService: UserService) {}
}
