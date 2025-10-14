import { Component, inject, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { UserStore } from '@store/user.store';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  imports: [RouterLink, MatIconModule, MatButtonModule],
})
export class HomeComponent {
  protected readonly userStore = inject(UserStore);
  protected readonly router = inject(Router);

  isLoggedIn: Signal<boolean> = this.userStore.isLoggedIn;
}
