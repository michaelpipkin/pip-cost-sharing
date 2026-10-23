import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from '@services/analytics.service';
import { createMockAnalyticsService } from '@testing/test-helpers';
import * as firestoreModule from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminErrorLogService } from './admin-error-log.service';

const mockFs = {};

describe('AdminErrorLogService', () => {
  let service: AdminErrorLogService;
  let analytics: ReturnType<typeof createMockAnalyticsService>;
  let batch: {
    delete: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
  };
  const collectionRef = { path: 'app_errors' };
  const queryRef = { kind: 'query' };

  beforeEach(() => {
    analytics = createMockAnalyticsService();
    batch = { delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(firestoreModule, 'collection').mockReturnValue(
      collectionRef as any
    );
    vi.spyOn(firestoreModule, 'where').mockImplementation(
      (field: any, op: any, value: any) =>
        ({ where: [field, op, value] }) as any
    );
    vi.spyOn(firestoreModule, 'orderBy').mockImplementation(
      (field: any, dir: any) => ({ orderBy: [field, dir] }) as any
    );
    vi.spyOn(firestoreModule, 'limit').mockImplementation(
      (n: number) => ({ limit: n }) as any
    );
    vi.spyOn(firestoreModule, 'query').mockReturnValue(queryRef as any);
    vi.spyOn(firestoreModule, 'doc').mockImplementation(
      (_fs: any, col: string, id: string) => ({ path: `${col}/${id}` }) as any
    );
    vi.spyOn(firestoreModule, 'deleteDoc').mockResolvedValue(undefined);
    vi.spyOn(firestoreModule, 'writeBatch').mockReturnValue(batch as any);
    vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue({
      docs: [],
    } as any);

    TestBed.configureTestingModule({
      providers: [
        AdminErrorLogService,
        { provide: firestoreModule.getFirestore, useValue: mockFs },
        { provide: AnalyticsService, useValue: analytics },
      ],
    });
    service = TestBed.inject(AdminErrorLogService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('getAppErrors', () => {
    it('should query app_errors by timestamp range, newest first, limited to 500', async () => {
      const start = new Date(2024, 0, 1, 8, 30);
      const end = new Date(2024, 0, 7, 9, 15);
      const fromDate = vi.spyOn(firestoreModule.Timestamp, 'fromDate');
      await service.getAppErrors(start, end);

      expect(firestoreModule.collection).toHaveBeenCalledWith(
        mockFs,
        'app_errors'
      );
      expect(firestoreModule.query).toHaveBeenCalledWith(
        collectionRef,
        { where: ['timestamp', '>=', fromDate.mock.results[0]!.value] },
        { where: ['timestamp', '<=', fromDate.mock.results[1]!.value] },
        { orderBy: ['timestamp', 'desc'] },
        { limit: 500 }
      );
      expect(fromDate.mock.calls[0]![0]).toEqual(start);
    });

    it('should move the end date to 23:59:59.999 on a copy without mutating the caller date', async () => {
      const start = new Date(2024, 0, 1);
      const end = new Date(2024, 0, 7, 9, 15, 30, 250);
      const original = end.getTime();
      const fromDate = vi.spyOn(firestoreModule.Timestamp, 'fromDate');
      await service.getAppErrors(start, end);

      const endArg = fromDate.mock.calls[1]![0] as Date;
      expect(endArg).not.toBe(end);
      expect(endArg.getFullYear()).toBe(2024);
      expect(endArg.getMonth()).toBe(0);
      expect(endArg.getDate()).toBe(7);
      expect(endArg.getHours()).toBe(23);
      expect(endArg.getMinutes()).toBe(59);
      expect(endArg.getSeconds()).toBe(59);
      expect(endArg.getMilliseconds()).toBe(999);
      expect(end.getTime()).toBe(original);
    });

    it('should return the documents with their doc ids and data', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue({
        docs: [
          { id: 'e1', data: () => ({ component: 'A', message: 'm1' }) },
          { id: 'e2', data: () => ({ component: 'B', message: 'm2' }) },
        ],
      } as any);
      const result = await service.getAppErrors(new Date(), new Date());
      expect(result).toEqual([
        { id: 'e1', component: 'A', message: 'm1' },
        { id: 'e2', component: 'B', message: 'm2' },
      ]);
    });

    // BUG (B10): src/app/services/admin-error-log.service.ts:37 `{ id: d.id, ...d.data() }`
    // lets a stored `id` field override the real doc id; deferred by owner 2026-10-21
    it.fails('should not let a stored id field override the doc id', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue({
        docs: [
          { id: 'real-id', data: () => ({ id: 'stored-id', message: 'm' }) },
        ],
      } as any);
      const result = await service.getAppErrors(new Date(), new Date());
      expect(result[0]!.id).toBe('real-id');
    });

    it('should log with the documented component/action and rethrow on failure', async () => {
      const failure = new Error('boom');
      vi.spyOn(firestoreModule, 'getDocs').mockRejectedValue(failure);
      await expect(service.getAppErrors(new Date(), new Date())).rejects.toBe(
        failure
      );
      expect(analytics.logError).toHaveBeenCalledWith(
        'Admin Error Log Service',
        'getAppErrors',
        'Failed to load app errors',
        'boom'
      );
    });

    it('should log "Unknown error" for a non-Error rejection', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockRejectedValue('nope');
      await expect(service.getAppErrors(new Date(), new Date())).rejects.toBe(
        'nope'
      );
      expect(analytics.logError).toHaveBeenCalledWith(
        'Admin Error Log Service',
        'getAppErrors',
        'Failed to load app errors',
        'Unknown error'
      );
    });
  });

  describe('deleteAppError', () => {
    it('should delete the single app_errors doc', async () => {
      await service.deleteAppError('e1');
      expect(firestoreModule.doc).toHaveBeenCalledWith(
        mockFs,
        'app_errors',
        'e1'
      );
      expect(firestoreModule.deleteDoc).toHaveBeenCalledTimes(1);
      expect(firestoreModule.deleteDoc).toHaveBeenCalledWith({
        path: 'app_errors/e1',
      });
    });

    it('should log with the documented component/action and rethrow on failure', async () => {
      const failure = new Error('denied');
      vi.spyOn(firestoreModule, 'deleteDoc').mockRejectedValue(failure);
      await expect(service.deleteAppError('e1')).rejects.toBe(failure);
      expect(analytics.logError).toHaveBeenCalledWith(
        'Admin Error Log Service',
        'deleteAppError',
        'Failed to delete app error',
        'denied'
      );
    });
  });

  describe('deleteAppErrors', () => {
    it('should queue every id in one batch and commit once', async () => {
      await service.deleteAppErrors(['a', 'b', 'c']);
      expect(batch.delete.mock.calls).toEqual([
        [{ path: 'app_errors/a' }],
        [{ path: 'app_errors/b' }],
        [{ path: 'app_errors/c' }],
      ]);
      expect(batch.commit).toHaveBeenCalledTimes(1);
      expect(firestoreModule.writeBatch).toHaveBeenCalledWith(mockFs);
    });

    it('should log with the documented component/action and rethrow on failure', async () => {
      const failure = new Error('commit failed');
      batch.commit.mockRejectedValue(failure);
      await expect(service.deleteAppErrors(['a'])).rejects.toBe(failure);
      expect(analytics.logError).toHaveBeenCalledWith(
        'Admin Error Log Service',
        'deleteAppErrors',
        'Failed to delete app errors',
        'commit failed'
      );
    });
  });
});
