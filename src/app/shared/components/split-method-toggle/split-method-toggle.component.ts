import { Component, model, output } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { SplitMethod } from '@utils/split-method';

@Component({
  selector: 'app-split-method-toggle',
  standalone: true,
  imports: [MatButtonToggleModule],
  templateUrl: './split-method-toggle.component.html',
})
export class SplitMethodToggleComponent {
  splitMethod = model<SplitMethod>('amount');
  methodChanged = output<SplitMethod>();

  protected onChange(value: SplitMethod): void {
    this.splitMethod.set(value);
    this.methodChanged.emit(value);
  }
}
