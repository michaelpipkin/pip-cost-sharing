import { Injectable, signal, Signal } from '@angular/core';

/**
 * Filter value types supported by the table filter system
 */
export type FilterValue =
  | { type: 'text'; value: string; caseSensitive?: boolean }
  | { type: 'select'; value: any | any[]; multiple?: boolean }
  | { type: 'dateRange'; start: Date | null; end: Date | null }
  | { type: 'toggle'; value: boolean | null };

/**
 * Generic table filter service for managing filter state across table columns
 * @template T The type of data being filtered (typically your model type)
 *
 * @example
 * ```typescript
 * export class ExpensesComponent {
 *   filterService = new TableFilterService<Expense>();
 *
 *   filteredData = computed(() => {
 *     let data = this.expenses();
 *     const filters = this.filterService.filters();
 *
 *     filters.forEach((filterValue, key) => {
 *       data = this.applyFilter(data, key, filterValue);
 *     });
 *
 *     return data;
 *   });
 * }
 * ```
 */
@Injectable()
export class TableFilterService<T> {
  /**
   * Signal containing the current active filters as a Map
   * Key: property name from type T
   * Value: FilterValue with the filter configuration
   */
  private _filters = signal<Map<string, FilterValue>>(new Map());

  /**
   * Public read-only signal of active filters
   */
  filters: Signal<Map<string, FilterValue>> = this._filters.asReadonly();

  /**
   * Sets or updates a filter for a specific column
   * @param key The property key to filter on
   * @param value The filter configuration
   */
  setFilter(key: keyof T | string, value: FilterValue): void {
    const currentFilters = new Map(this._filters());
    currentFilters.set(key as string, value);
    this._filters.set(currentFilters);
  }

  /**
   * Removes a filter for a specific column
   * @param key The property key to clear the filter for
   */
  clearFilter(key: keyof T | string): void {
    const currentFilters = new Map(this._filters());
    currentFilters.delete(key as string);
    this._filters.set(currentFilters);
  }

  /**
   * Removes all active filters
   */
  clearAllFilters(): void {
    this._filters.set(new Map());
  }

  /**
   * Checks if there are any active filters
   * @returns true if at least one filter is active
   */
  hasActiveFilters(): boolean {
    return this._filters().size > 0;
  }

  /**
   * Gets the current filter value for a specific column
   * @param key The property key to get the filter for
   * @returns The filter value if it exists, undefined otherwise
   */
  getFilter(key: keyof T | string): FilterValue | undefined {
    return this._filters().get(key as string);
  }

  /**
   * Checks if a specific column has an active filter
   * @param key The property key to check
   * @returns true if the column has an active filter
   */
  hasFilter(key: keyof T | string): boolean {
    return this._filters().has(key as string);
  }

  /**
   * Gets the count of active filters
   * @returns The number of active filters
   */
  getActiveFilterCount(): number {
    return this._filters().size;
  }
}
