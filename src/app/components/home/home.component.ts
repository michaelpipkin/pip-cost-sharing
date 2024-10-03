import { Component, inject, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { UserService } from '@services/user.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatButtonModule],
})
export class HomeComponent {
  userService = inject(UserService);

  isLoggedIn: Signal<boolean> = this.userService.isLoggedIn;
}
