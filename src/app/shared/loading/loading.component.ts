import { CommonModule } from '@angular/common';
import { Component, inject, Signal } from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { LoadingService } from './loading.service';

@Component({
  selector: 'loading',
  templateUrl: './loading.component.html',
  styleUrls: ['./loading.component.scss'],
  standalone: true,
  imports: [CommonModule, MatProgressSpinner],
})
export class LoadingComponent {
  loadingService = inject(LoadingService);
  loading: Signal<boolean> = this.loadingService.loading;
}
