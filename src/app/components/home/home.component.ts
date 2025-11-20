import { Component, inject, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { TourService } from '@services/tour.service';
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
  protected readonly tourService = inject(TourService);

  isLoggedIn: Signal<boolean> = this.userStore.isLoggedIn;

  startDemoWalkthrough(): void {
    // Reset all tour completion states so the user sees the tours again
    this.tourService.resetAllTours();
    // Navigate to demo split page
    this.router.navigate(['demo', 'split']);
  }
}
