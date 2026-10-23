import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from '@services/analytics.service';
import { createMockAnalyticsService } from '@testing/test-helpers';
import * as firestoreModule from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminMailService } from './admin-mail.service';

const mockFs = {};

describe('AdminMailService', () => {
  let service: AdminMailService;
  let analytics: ReturnType<typeof createMockAnalyticsService>;
  let batch: {
    delete: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
  };
  const collectionRef = { path: 'mail' };
  const queryRef = { kind: 'query' };

  beforeEach(() => {
    analytics = createMockAnalyticsService();
    batch = { delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(firestoreModule, 'collection').mockReturnValue(
      collectionRef as any
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
        AdminMailService,
        { provide: firestoreModule.getFirestore, useValue: mockFs },
        { provide: AnalyticsService, useValue: analytics },
      ],
    });
    service = TestBed.inject(AdminMailService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('getMailDocuments', () => {
    it('should query mail by delivery.startTime desc with the default limit of 200', async () => {
      await service.getMailDocuments();
      expect(firestoreModule.collection).toHaveBeenCalledWith(mockFs, 'mail');
      expect(firestoreModule.query).toHaveBeenCalledWith(
        collectionRef,
        { orderBy: ['delivery.startTime', 'desc'] },
        { limit: 200 }
      );
    });

    it('should honour an explicit limit', async () => {
      await service.getMailDocuments(25);
      expect(firestoreModule.limit).toHaveBeenCalledWith(25);
    });

    it('should return the documents with their doc ids and data', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue({
        docs: [
          { id: 'm1', data: () => ({ to: 'a@x.com' }) },
          { id: 'm2', data: () => ({ to: ['b@x.com'] }) },
        ],
      } as any);
      expect(await service.getMailDocuments()).toEqual([
        { id: 'm1', to: 'a@x.com' },
        { id: 'm2', to: ['b@x.com'] },
      ]);
    });

    // BUG (B10): src/app/services/admin-mail.service.ts:32 `{ id: d.id, ...d.data() }`
    // lets a stored `id` field override the real doc id; deferred by owner 2026-10-21
    it.fails('should not let a stored id field override the doc id', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue({
        docs: [
          { id: 'real-id', data: () => ({ id: 'stored-id', to: 'a@x.com' }) },
        ],
      } as any);
      const result = await service.getMailDocuments();
      expect(result[0]!.id).toBe('real-id');
    });

    it('should log with the documented component/action and rethrow on failure', async () => {
      const failure = new Error('boom');
      vi.spyOn(firestoreModule, 'getDocs').mockRejectedValue(failure);
      await expect(service.getMailDocuments()).rejects.toBe(failure);
      expect(analytics.logError).toHaveBeenCalledWith(
        'Admin Mail Service',
        'getMailDocuments',
        'Failed to load mail documents',
        'boom'
      );
    });

    it('should log "Unknown error" for a non-Error rejection', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockRejectedValue(42);
      await expect(service.getMailDocuments()).rejects.toBe(42);
      expect(analytics.logError).toHaveBeenCalledWith(
        'Admin Mail Service',
        'getMailDocuments',
        'Failed to load mail documents',
        'Unknown error'
      );
    });
  });

  describe('deleteMailDocument', () => {
    it('should delete the single mail doc', async () => {
      await service.deleteMailDocument('m1');
      expect(firestoreModule.doc).toHaveBeenCalledWith(mockFs, 'mail', 'm1');
      expect(firestoreModule.deleteDoc).toHaveBeenCalledTimes(1);
      expect(firestoreModule.deleteDoc).toHaveBeenCalledWith({
        path: 'mail/m1',
      });
    });

    it('should log with the documented component/action and rethrow on failure', async () => {
      const failure = new Error('denied');
      vi.spyOn(firestoreModule, 'deleteDoc').mockRejectedValue(failure);
      await expect(service.deleteMailDocument('m1')).rejects.toBe(failure);
      expect(analytics.logError).toHaveBeenCalledWith(
        'Admin Mail Service',
        'deleteMailDocument',
        'Failed to delete mail document',
        'denied'
      );
    });
  });

  describe('deleteMailDocuments', () => {
    it('should queue every id in one batch and commit once', async () => {
      await service.deleteMailDocuments(['a', 'b']);
      expect(batch.delete.mock.calls).toEqual([
        [{ path: 'mail/a' }],
        [{ path: 'mail/b' }],
      ]);
      expect(batch.commit).toHaveBeenCalledTimes(1);
      expect(firestoreModule.writeBatch).toHaveBeenCalledWith(mockFs);
    });

    it('should log with the documented component/action and rethrow on failure', async () => {
      const failure = new Error('commit failed');
      batch.commit.mockRejectedValue(failure);
      await expect(service.deleteMailDocuments(['a'])).rejects.toBe(failure);
      expect(analytics.logError).toHaveBeenCalledWith(
        'Admin Mail Service',
        'deleteMailDocuments',
        'Failed to delete mail documents',
        'commit failed'
      );
    });
  });
});
