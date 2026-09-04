import { inject, Injectable } from '@angular/core';
import { AdminReportId, AdminReportResult } from '@models/admin-report';
import { getFunctions, httpsCallable } from 'firebase/functions';

@Injectable({
  providedIn: 'root',
})
export class AdminReportsService {
  protected readonly functions = inject(getFunctions);

  async runReport(reportId: AdminReportId): Promise<AdminReportResult> {
    const runReportFn = httpsCallable<{ reportId: AdminReportId }, AdminReportResult>(
      this.functions,
      'runAdminReport'
    );
    const result = await runReportFn({ reportId });
    return result.data;
  }

  async repairOrphanedMembers(
    memberPaths: string[]
  ): Promise<{ linkedCount: number }> {
    const repairFn = httpsCallable<
      { memberPaths: string[] },
      { linkedCount: number }
    >(this.functions, 'repairOrphanedMembers');
    const result = await repairFn({ memberPaths });
    return result.data;
  }

  async backfillOrphanedRegistrations(
    uids: string[]
  ): Promise<{ createdCount: number }> {
    const backfillFn = httpsCallable<
      { uids: string[] },
      { createdCount: number }
    >(this.functions, 'backfillOrphanedRegistrations');
    const result = await backfillFn({ uids });
    return result.data;
  }
}
