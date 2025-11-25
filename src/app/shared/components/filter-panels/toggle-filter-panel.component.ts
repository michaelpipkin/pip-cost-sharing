import { Component, effect, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

export interface ToggleFilterValue {
  value: boolean | null;
}

@Component({
  selector: 'app-toggle-filter-panel',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="filter-panel">
      @if (columnLabel()) {
        <div class="filter-panel-header">
          <h5>Filter {{ columnLabel() }}</h5>
        </div>
      }
      <div class="filter-panel-content">
        <div class="filter-toggle-group">
          <button
            matButton="elevated"
            type="button"
            [class.active]="selectedValue === null"
            (click)="selectAll()"
          >
            All
          </button>
          <button
            matButton="elevated"
            type="button"
            [class.active]="selectedValue === true"
            (click)="selectTrue()"
          >
            Yes
          </button>
          <button
            matButton="elevated"
            type="button"
            [class.active]="selectedValue === false"
            (click)="selectFalse()"
          >
            No
          </button>
        </div>
      </div>

      <div class="filter-panel-actions">
        <button
          matButton="elevated"
          type="button"
          class="btn-secondary"
          (click)="onClear()"
        >
          Clear
        </button>
        <button
          matButton="elevated"
          type="button"
          class="btn-primary"
          (click)="onApply()"
          [disabled]="!canApply()"
        >
          Apply
        </button>
      </div>
    </div>
  `,
})
export class ToggleFilterPanelComponent {
  initialValue = input<ToggleFilterValue>();
  columnLabel = input<string>();
  trueLabel = input<string>('Yes');
  falseLabel = input<string>('No');
  allLabel = input<string>('All');

  apply = output<ToggleFilterValue>();
  clear = output<void>();

  selectedValue: boolean | null = null;
  hadInitialFilter = false;

  constructor() {
    effect(() => {
      const initial = this.initialValue();
      if (initial && initial.value !== null) {
        this.selectedValue = initial.value;
        this.hadInitialFilter = true;
      } else {
        this.selectedValue = null;
        this.hadInitialFilter = false;
      }
    });
  }

  selectAll(): void {
    this.selectedValue = null;
  }

  selectTrue(): void {
    this.selectedValue = true;
  }

  selectFalse(): void {
    this.selectedValue = false;
  }

  onApply(): void {
    // Allow applying null value if there was an initial filter
    // (this clears the filter when user selects "All")
    if (this.selectedValue !== null || this.hadInitialFilter) {
      this.apply.emit({
        value: this.selectedValue,
      });
    }
  }

  canApply(): boolean {
    // Enable Apply button if:
    // 1. A value is selected (true or false), OR
    // 2. User selected "All" (null) but there was an initial filter to clear
    return this.selectedValue !== null || this.hadInitialFilter;
  }

  onClear(): void {
    this.selectedValue = null;
    this.clear.emit();
  }
}
