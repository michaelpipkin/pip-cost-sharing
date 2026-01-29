export interface AdminStatistics {
  // Core counts
  totalGroups: number;
  activeGroups: number;
  activeGroupsWithMultipleMembers: number;
  activeGroupsWithExpenses: number;
  totalUsers: number;
  totalMembers: number;
  totalActiveMembers: number;

  // Time-based (last 30 days)
  groupsWithRecentActivity: number;
  expensesCreatedLast30Days: number;

  // Averages
  avgMembersPerActiveGroup: number;

  generatedAt: string;
}
