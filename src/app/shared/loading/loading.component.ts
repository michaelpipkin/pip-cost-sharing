import { AsyncPipe, CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { LoadingService } from './loading.service';

@Component({
  selector: 'loading',
  templateUrl: './loading.component.html',
  styleUrls: ['./loading.component.scss'],
  standalone: true,
  imports: [CommonModule, MatProgressSpinner, AsyncPipe],
})
export class LoadingComponent {
  constructor(public loadingService: LoadingService) {}
}
