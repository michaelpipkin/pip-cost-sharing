import { TestBed } from '@angular/core/testing';
import { AdminReportId, AdminReportResult } from '@models/admin-report';
import { describe, expect, it } from 'vitest';
import { ReportsStore } from './reports.store';

function report(
  reportId: AdminReportId,
  title: string = reportId
): AdminReportResult {
  return {
    reportId,
    title,
    generatedAt: '2026-01-01T00:00:00.000Z',
    summary: [],
    tables: [],
  };
}

describe('ReportsStore', () => {
  function setup() {
    return TestBed.inject(ReportsStore);
  }

  it('should start with no results', () => {
    expect(setup().results()).toEqual({});
  });

  describe('setResult', () => {
    it('should keep the results stored under other keys', () => {
      const store = setup();
      const overview = report('overview');
      const users = report('users');

      store.setResult('overview', overview);
      store.setResult('users', users);

      expect(store.results().overview).toBe(overview);
      expect(store.results().users).toBe(users);
    });

    it('should replace the result for the same key', () => {
      const store = setup();
      store.setResult('overview', report('overview', 'first'));
      const second = report('overview', 'second');

      store.setResult('overview', second);

      expect(store.results().overview).toBe(second);
      expect(Object.keys(store.results())).toEqual(['overview']);
    });

    it('should produce a new results object instead of mutating the old one', () => {
      const store = setup();
      store.setResult('overview', report('overview'));
      const before = store.results();

      store.setResult('users', report('users'));

      expect(store.results()).not.toBe(before);
      expect(before.users).toBeUndefined();
    });
  });

  describe('clearResult', () => {
    it('should remove only the named key', () => {
      const store = setup();
      store.setResult('overview', report('overview'));
      store.setResult('users', report('users'));

      store.clearResult('overview');

      expect(Object.keys(store.results())).toEqual(['users']);
    });

    it('should produce a new results object instead of mutating the old one', () => {
      const store = setup();
      store.setResult('overview', report('overview'));
      const before = store.results();

      store.clearResult('overview');

      expect(store.results()).not.toBe(before);
      expect(before.overview).toBeDefined();
    });

    it('should be harmless for a key that was never set', () => {
      const store = setup();
      store.setResult('users', report('users'));

      store.clearResult('overview');

      expect(Object.keys(store.results())).toEqual(['users']);
    });
  });

  describe('clearAll', () => {
    it('should empty the results', () => {
      const store = setup();
      store.setResult('overview', report('overview'));
      store.setResult('users', report('users'));

      store.clearAll();

      expect(store.results()).toEqual({});
    });
  });
});
