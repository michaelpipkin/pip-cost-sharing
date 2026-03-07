import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as functionsModule from 'firebase/functions';
import { AdminStatisticsService } from './admin-statistics.service';

describe('AdminStatisticsService', () => {
  let service: AdminStatisticsService;
  const mockFunctions = {};
  const mockStats = { userCount: 10, groupCount: 5, expenseCount: 100 };

  beforeEach(() => {
    vi.spyOn(functionsModule, 'getFunctions').mockReturnValue(
      mockFunctions as any
    );
    vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
      vi.fn().mockResolvedValue({ data: mockStats }) as any
    );

    TestBed.configureTestingModule({
      providers: [
        AdminStatisticsService,
        { provide: functionsModule.getFunctions, useValue: mockFunctions },
      ],
    });
    service = TestBed.inject(AdminStatisticsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call the getAdminStatistics cloud function', async () => {
    await service.getStatistics();
    expect(functionsModule.httpsCallable).toHaveBeenCalledWith(
      mockFunctions,
      'getAdminStatistics'
    );
  });

  it('should return the data from the cloud function result', async () => {
    const result = await service.getStatistics();
    expect(result).toEqual(mockStats);
  });
});
