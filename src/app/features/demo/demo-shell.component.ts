import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DemoService } from '@services/demo.service';

@Component({
  selector: 'app-demo-shell',
  template: '<router-outlet />',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoShellComponent {
  constructor() {
    const demoService = inject(DemoService);
    demoService.enterDemoMode();
    inject(DestroyRef).onDestroy(() => demoService.exitDemoMode());
  }
}
