export interface AdminStatistics {
  // Core counts
  totalGroups: number;
  activeGroups: number;
  activeGroupsWithMultipleMembers: number;
  activeGroupsWithExpenses: number;
  totalUsers: number;
  totalMembers: number;
  totalActiveMembers: number;
  totalExpenses: number;

  // Time-based (last 30 days)
  groupsCreatedLast30Days: number;
  usersRegisteredLast30Days: number;
  groupsWithRecentActivity: number;
  expensesCreatedLast30Days: number;

  // Averages
  avgMembersPerActiveGroup: number;
  avgExpensesPerActiveGroup: number;

  generatedAt: string;
}
