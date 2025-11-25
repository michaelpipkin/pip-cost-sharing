import { Component, effect, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

export interface SelectFilterValue {
  value: any | any[];
  multiple: boolean;
}

@Component({
  selector: 'app-select-filter-panel',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatOptionModule,
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
          <mat-label>{{ label() }}</mat-label>
          <mat-select
            [(ngModel)]="selectedValue"
            [multiple]="multiple()"
            (selectionChange)="onSelectionChange()"
          >
            @for (option of options(); track trackByFn()($index, option)) {
              <mat-option [value]="option">
                {{ displayFn()(option) }}
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (multiple() && options().length > 1) {
          <div class="filter-quick-actions">
            <button
              matButton="elevated"
              type="button"
              class="btn-secondary"
              (click)="selectAll()"
              [disabled]="isAllSelected()"
            >
              Select All
            </button>
            <button
              matButton="elevated"
              type="button"
              class="btn-secondary"
              (click)="clearSelection()"
              [disabled]="!selectedValue || selectedValue.length === 0"
            >
              Clear All
            </button>
          </div>
        }
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
          [disabled]="!hasSelection()"
        >
          Apply
        </button>
      </div>
    </div>
  `,
})
export class SelectFilterPanelComponent {
  options = input<any[]>([]);
  initialValue = input<SelectFilterValue>();
  multiple = input<boolean>(false);
  label = input<string>('Select value');
  columnLabel = input<string>();
  displayFn = input<(option: any) => string>(
    (option) => option?.toString() || ''
  );
  trackByFn = input<(index: number, option: any) => any>(
    (index, option) => option
  );

  apply = output<SelectFilterValue>();
  clear = output<void>();

  selectedValue: any | any[] = this.multiple() ? [] : null;

  constructor() {
    effect(() => {
      const initial = this.initialValue();
      if (initial) {
        this.selectedValue = initial.value;
      } else {
        this.selectedValue = this.multiple() ? [] : null;
      }
    });
  }

  onSelectionChange(): void {
    // Optional: could auto-apply for single select
    // if (!this.multiple()) {
    //   this.onApply();
    // }
  }

  onApply(): void {
    if (this.hasSelection()) {
      this.apply.emit({
        value: this.selectedValue,
        multiple: this.multiple(),
      });
    }
  }

  onClear(): void {
    this.selectedValue = this.multiple() ? [] : null;
    this.clear.emit();
  }

  selectAll(): void {
    this.selectedValue = [...this.options()];
  }

  clearSelection(): void {
    this.selectedValue = this.multiple() ? [] : null;
  }

  isAllSelected(): boolean {
    return (
      this.multiple() &&
      Array.isArray(this.selectedValue) &&
      this.selectedValue.length === this.options().length
    );
  }

  hasSelection(): boolean {
    if (this.multiple()) {
      return Array.isArray(this.selectedValue) && this.selectedValue.length > 0;
    }
    return this.selectedValue !== null && this.selectedValue !== undefined;
  }
}
