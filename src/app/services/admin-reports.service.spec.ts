import { TestBed } from '@angular/core/testing';
import { AdminReportResult } from '@models/admin-report';
import * as functionsModule from 'firebase/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminReportsService } from './admin-reports.service';

const mockFunctions = {};

describe('AdminReportsService', () => {
  let service: AdminReportsService;
  let callable: ReturnType<typeof vi.fn>;
  let httpsCallable: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    callable = vi.fn();
    httpsCallable = vi
      .spyOn(functionsModule, 'httpsCallable')
      .mockReturnValue(callable as any) as unknown as ReturnType<typeof vi.fn>;
    TestBed.configureTestingModule({
      providers: [
        AdminReportsService,
        { provide: functionsModule.getFunctions, useValue: mockFunctions },
      ],
    });
    service = TestBed.inject(AdminReportsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('runReport calls runAdminReport with the report id and returns result.data', async () => {
    const data = {
      title: 'Overview',
      sections: [],
    } as unknown as AdminReportResult;
    callable.mockResolvedValue({ data });
    const result = await service.runReport('active-groups');
    expect(httpsCallable).toHaveBeenCalledWith(mockFunctions, 'runAdminReport');
    expect(callable).toHaveBeenCalledWith({ reportId: 'active-groups' });
    expect(result).toBe(data);
  });

  it('repairOrphanedMembers calls repairOrphanedMembers with the member paths and returns result.data', async () => {
    callable.mockResolvedValue({ data: { linkedCount: 2 } });
    const paths = ['groups/g1/members/m1', 'groups/g2/members/m2'];
    const result = await service.repairOrphanedMembers(paths);
    expect(httpsCallable).toHaveBeenCalledWith(
      mockFunctions,
      'repairOrphanedMembers'
    );
    expect(callable).toHaveBeenCalledWith({ memberPaths: paths });
    expect(result).toEqual({ linkedCount: 2 });
  });

  it('backfillOrphanedRegistrations calls backfillOrphanedRegistrations with the uids and returns result.data', async () => {
    callable.mockResolvedValue({ data: { createdCount: 3 } });
    const result = await service.backfillOrphanedRegistrations([
      'u1',
      'u2',
      'u3',
    ]);
    expect(httpsCallable).toHaveBeenCalledWith(
      mockFunctions,
      'backfillOrphanedRegistrations'
    );
    expect(callable).toHaveBeenCalledWith({ uids: ['u1', 'u2', 'u3'] });
    expect(result).toEqual({ createdCount: 3 });
  });

  it('propagates a rejected callable from each method', async () => {
    const failure = new Error('permission-denied');
    callable.mockRejectedValue(failure);
    await expect(service.runReport('users')).rejects.toBe(failure);
    await expect(service.repairOrphanedMembers([])).rejects.toBe(failure);
    await expect(service.backfillOrphanedRegistrations([])).rejects.toBe(
      failure
    );
  });
});
