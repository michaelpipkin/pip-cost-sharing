export type AdminReportId =
  | 'overview'
  | 'active-groups'
  | 'users'
  | 'orphaned-members'
  | 'orphaned-registrations'
  | 'duplicate-users'
  | 'expense-activity';

export interface AdminReportOption {
  id: AdminReportId;
  label: string;
}

export const ADMIN_REPORT_OPTIONS: AdminReportOption[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'active-groups', label: 'Active Groups' },
  { id: 'users', label: 'Users' },
  { id: 'orphaned-members', label: 'Orphaned Members' },
  { id: 'orphaned-registrations', label: 'Orphaned Registrations' },
  { id: 'duplicate-users', label: 'Duplicate User Accounts' },
  { id: 'expense-activity', label: 'Expense Activity' },
];

export interface AdminReportStat {
  label: string;
  value: string | number;
}

export interface AdminReportSection {
  title: string;
  stats: AdminReportStat[];
}

export interface AdminReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
}

export type AdminReportRow = Record<string, string | number | boolean | null>;

export interface AdminReportTable {
  title: string;
  columns: AdminReportColumn[];
  rows: AdminReportRow[];
  emptyMessage?: string;
}

export interface AdminReportResult {
  reportId: AdminReportId;
  title: string;
  generatedAt: string;
  summary: AdminReportSection[];
  tables: AdminReportTable[];
}
