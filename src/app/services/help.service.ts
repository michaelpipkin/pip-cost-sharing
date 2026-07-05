import { inject, Injectable } from '@angular/core';
import { githubConfig } from '@app/github.config';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { GitHubIssue, IHelpService } from './help.service.interface';

@Injectable({
  providedIn: 'root',
})
export class HelpService implements IHelpService {
  protected readonly functions = inject(getFunctions);

  private readonly apiUrl =
    'https://api.github.com/repos/michaelpipkin/pip-cost-sharing/issues';
  private readonly token: string = githubConfig.personalAccessToken;

  async createIssue(title: string, body: string): Promise<GitHubIssue> {
    const issueData = { title, body, assignees: ['michaelpipkin'] };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `token ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(issueData),
    });

    if (!response.ok) {
      throw new Error(`Failed to create issue: ${response.statusText}`);
    }

    return response.json() as Promise<GitHubIssue>;
  }

  async notifyAdminOfIssue(
    issue: GitHubIssue,
    description: string,
    reporterEmail?: string
  ): Promise<void> {
    const fn = httpsCallable<
      {
        number: number;
        url: string;
        title: string;
        body: string;
        reporterEmail?: string;
      },
      { success: boolean }
    >(this.functions, 'notifyNewIssue');
    await fn({
      number: issue.number,
      url: issue.html_url,
      title: issue.title,
      body: description,
      reporterEmail,
    });
  }
}
