export interface IHelpService {
  createIssue(title: string, body: string): Promise<object>;
}
