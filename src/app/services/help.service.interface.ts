export interface GitHubIssue {
  number: number;
  html_url: string;
  title: string;
  body: string;
}

export interface IHelpService {
  createIssue(title: string, body: string): Promise<GitHubIssue>;
  notifyAdminOfIssue(
    issue: GitHubIssue,
    description: string,
    reporterEmail?: string
  ): Promise<void>;
}
