import { describe, it, expect, beforeEach } from 'vitest';
import { TableFilterService, FilterValue } from './table-filter.service';

interface TestModel {
  name: string;
  amount: number;
  date: Date;
  active: boolean;
}

describe('TableFilterService', () => {
  let service: TableFilterService<TestModel>;

  beforeEach(() => {
    service = new TableFilterService<TestModel>();
  });

  describe('initial state', () => {
    it('should have no active filters', () => {
      expect(service.hasActiveFilters()).toBe(false);
      expect(service.getActiveFilterCount()).toBe(0);
      expect(service.filters().size).toBe(0);
    });
  });

  describe('setFilter', () => {
    it('should add a text filter', () => {
      const filter: FilterValue = { type: 'text', value: 'hello' };
      service.setFilter('name', filter);
      expect(service.hasFilter('name')).toBe(true);
      expect(service.getFilter('name')).toEqual(filter);
    });

    it('should add a select filter', () => {
      const filter: FilterValue = { type: 'select', value: 'option1' };
      service.setFilter('name', filter);
      expect(service.getFilter('name')).toEqual(filter);
    });

    it('should add a toggle filter', () => {
      const filter: FilterValue = { type: 'toggle', value: true };
      service.setFilter('active', filter);
      expect(service.getFilter('active')).toEqual(filter);
    });

    it('should add a dateRange filter', () => {
      const filter: FilterValue = {
        type: 'dateRange',
        start: new Date(2024, 0, 1),
        end: new Date(2024, 11, 31),
      };
      service.setFilter('date', filter);
      expect(service.getFilter('date')).toEqual(filter);
    });

    it('should overwrite an existing filter', () => {
      service.setFilter('name', { type: 'text', value: 'first' });
      service.setFilter('name', { type: 'text', value: 'second' });
      expect(service.getFilter('name')).toEqual({
        type: 'text',
        value: 'second',
      });
      expect(service.getActiveFilterCount()).toBe(1);
    });
  });

  describe('clearFilter', () => {
    it('should remove a specific filter', () => {
      service.setFilter('name', { type: 'text', value: 'test' });
      service.setFilter('amount', { type: 'select', value: 100 });
      service.clearFilter('name');
      expect(service.hasFilter('name')).toBe(false);
      expect(service.hasFilter('amount')).toBe(true);
      expect(service.getActiveFilterCount()).toBe(1);
    });

    it('should handle clearing a non-existent filter', () => {
      service.clearFilter('name');
      expect(service.getActiveFilterCount()).toBe(0);
    });
  });

  describe('clearAllFilters', () => {
    it('should remove all filters', () => {
      service.setFilter('name', { type: 'text', value: 'test' });
      service.setFilter('amount', { type: 'select', value: 100 });
      service.setFilter('active', { type: 'toggle', value: true });
      service.clearAllFilters();
      expect(service.hasActiveFilters()).toBe(false);
      expect(service.getActiveFilterCount()).toBe(0);
    });
  });

  describe('hasActiveFilters', () => {
    it('should return false when no filters are set', () => {
      expect(service.hasActiveFilters()).toBe(false);
    });

    it('should return true when at least one filter is set', () => {
      service.setFilter('name', { type: 'text', value: 'test' });
      expect(service.hasActiveFilters()).toBe(true);
    });
  });

  describe('getFilter', () => {
    it('should return undefined for non-existent filter', () => {
      expect(service.getFilter('name')).toBeUndefined();
    });

    it('should return the filter value for an existing filter', () => {
      const filter: FilterValue = { type: 'text', value: 'test' };
      service.setFilter('name', filter);
      expect(service.getFilter('name')).toEqual(filter);
    });
  });

  describe('multiple concurrent filters', () => {
    it('should manage multiple filters independently', () => {
      service.setFilter('name', { type: 'text', value: 'alice' });
      service.setFilter('amount', { type: 'select', value: 50 });
      service.setFilter('active', { type: 'toggle', value: false });

      expect(service.getActiveFilterCount()).toBe(3);

      service.clearFilter('amount');
      expect(service.getActiveFilterCount()).toBe(2);
      expect(service.hasFilter('name')).toBe(true);
      expect(service.hasFilter('active')).toBe(true);
      expect(service.hasFilter('amount')).toBe(false);
    });
  });

  describe('filters signal', () => {
    it('should return a readonly signal of the current filters', () => {
      service.setFilter('name', { type: 'text', value: 'test' });
      const filters = service.filters();
      expect(filters).toBeInstanceOf(Map);
      expect(filters.size).toBe(1);
      expect(filters.get('name')).toEqual({ type: 'text', value: 'test' });
    });
  });
});
