export interface IHistoryService {
  getHistoryForGroup(groupId: string): void;
  deleteHistory(groupId: string, historyId: string): Promise<void>;
}
