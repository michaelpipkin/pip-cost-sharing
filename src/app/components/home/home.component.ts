import { CommonModule } from '@angular/common';
import { Component, inject, Signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { UserService } from '@services/user.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIcon],
})
export class HomeComponent {
  userService = inject(UserService);

  isLoggedIn: Signal<boolean> = this.userService.isLoggedIn;
}
