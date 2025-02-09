import { Component, inject, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { UserStore } from '@store/user.store';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  imports: [RouterLink, MatIconModule, MatButtonModule],
})
export class HomeComponent {
  userStore = inject(UserStore);

  isLoggedIn: Signal<boolean> = this.userStore.isLoggedIn;
}
