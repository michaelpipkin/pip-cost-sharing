import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { GuidedTourService } from '@services/guided-tour.service';

/** The callout shown beside the spotlighted element on each tour step. */
@Component({
  selector: 'app-guided-tour-card',
  templateUrl: './guided-tour-card.component.html',
  styleUrl: './guided-tour-card.component.scss',
  imports: [A11yModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'guided-tour-title',
    'aria-describedby': 'guided-tour-text',
    'data-testid': 'guided-tour-card',
  },
})
export class GuidedTourCardComponent {
  protected readonly tour = inject(GuidedTourService);

  onPrimary(): void {
    if (this.tour.isLast()) {
      this.tour.stop('completed');
    } else {
      this.tour.next();
    }
  }
}
