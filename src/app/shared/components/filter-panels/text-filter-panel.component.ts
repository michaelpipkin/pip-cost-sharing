import { Component, effect, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface TextFilterValue {
  value: string;
  caseSensitive: boolean;
}

@Component({
  selector: 'app-text-filter-panel',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
  ],
  template: `
    <div class="filter-panel">
      @if (columnLabel()) {
        <div class="filter-panel-header">
          <h5>Filter {{ columnLabel() }}</h5>
        </div>
      }
      <div class="filter-panel-content">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Filter text</mat-label>
          <input
            matInput
            [(ngModel)]="filterText"
            (keyup.enter)="onApply()"
            placeholder="Enter text to filter..."
            autofocus
          />
        </mat-form-field>

        <mat-checkbox [(ngModel)]="caseSensitive">
          Case sensitive
        </mat-checkbox>
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
          [disabled]="!filterText"
        >
          Apply
        </button>
      </div>
    </div>
  `,
})
export class TextFilterPanelComponent {
  initialValue = input<TextFilterValue>();
  columnLabel = input<string>();
  apply = output<TextFilterValue>();
  clear = output<void>();

  filterText = '';
  caseSensitive = false;

  constructor() {
    effect(() => {
      const initial = this.initialValue();
      if (initial) {
        this.filterText = initial.value;
        this.caseSensitive = initial.caseSensitive;
      }
    });
  }

  onApply(): void {
    if (this.filterText) {
      this.apply.emit({
        value: this.filterText,
        caseSensitive: this.caseSensitive,
      });
    }
  }

  onClear(): void {
    this.filterText = '';
    this.caseSensitive = false;
    this.clear.emit();
  }
}
