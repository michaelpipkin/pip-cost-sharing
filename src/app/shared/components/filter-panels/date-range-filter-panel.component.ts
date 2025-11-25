import { Component, effect, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DateShortcutKeysDirective } from '@shared/directives/date-plus-minus.directive';

export interface DateRangeFilterValue {
  start: Date | null;
  end: Date | null;
}

@Component({
  selector: 'app-date-range-filter-panel',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatButtonModule,
    DateShortcutKeysDirective,
  ],
  template: `
    <div class="filter-panel">
      @if (columnLabel()) {
        <div class="filter-panel-header">
          <h5>Filter {{ columnLabel() }}</h5>
        </div>
      }
      <div class="filter-panel-content">
        <div class="filter-quick-actions">
          <button
            matButton="elevated"
            type="button"
            class="btn-secondary"
            (click)="setToday()"
          >
            Today
          </button>
          <button
            matButton="elevated"
            type="button"
            class="btn-secondary"
            (click)="setLast7Days()"
          >
            Last 7 Days
          </button>
        </div>
        <div class="filter-quick-actions">
          <button
            matButton="elevated"
            type="button"
            class="btn-secondary"
            (click)="setLast30Days()"
          >
            Last 30 Days
          </button>
          <button
            matButton="elevated"
            type="button"
            class="btn-secondary"
            (click)="setLast90Days()"
          >
            Last 90 Days
          </button>
        </div>

        <mat-form-field class="datepicker" subscriptSizing="dynamic">
          <mat-label>Start date</mat-label>
          <input
            matInput
            [matDatepicker]="startPicker"
            [(ngModel)]="startDate"
            appDateShortcutKeys
          />
          <mat-datepicker-toggle
            matIconSuffix
            [for]="startPicker"
          ></mat-datepicker-toggle>
          <mat-datepicker #startPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field class="datepicker" subscriptSizing="dynamic">
          <mat-label>End date</mat-label>
          <input
            matInput
            [matDatepicker]="endPicker"
            [(ngModel)]="endDate"
            appDateShortcutKeys
          />
          <mat-datepicker-toggle
            matIconSuffix
            [for]="endPicker"
          ></mat-datepicker-toggle>
          <mat-datepicker #endPicker></mat-datepicker>
        </mat-form-field>
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
          [disabled]="!startDate && !endDate"
        >
          Apply
        </button>
      </div>
    </div>
  `,
})
export class DateRangeFilterPanelComponent {
  initialValue = input<DateRangeFilterValue>();
  columnLabel = input<string>();
  apply = output<DateRangeFilterValue>();
  clear = output<void>();

  startDate: Date | null = null;
  endDate: Date | null = null;

  constructor() {
    effect(() => {
      const initial = this.initialValue();
      if (initial) {
        this.startDate = initial.start;
        this.endDate = initial.end;
      } else {
        this.startDate = null;
        this.endDate = null;
      }
    });
  }

  onApply(): void {
    if (this.startDate || this.endDate) {
      this.apply.emit({
        start: this.startDate,
        end: this.endDate,
      });
    }
  }

  onClear(): void {
    this.startDate = null;
    this.endDate = null;
    this.clear.emit();
  }

  setToday(): void {
    const today = new Date();
    this.startDate = today;
    this.endDate = today;
  }

  setLast7Days(): void {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    this.startDate = start;
    this.endDate = end;
  }

  setLast30Days(): void {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    this.startDate = start;
    this.endDate = end;
  }

  setLast90Days(): void {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 90);
    this.startDate = start;
    this.endDate = end;
  }
}
