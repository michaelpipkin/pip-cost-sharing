import { Injectable } from '@angular/core';
import { githubConfig } from '@app/github.config';
import { IHelpService } from './help.service.interface';

@Injectable({
  providedIn: 'root',
})
export class HelpService implements IHelpService {
  private apiUrl =
    'https://api.github.com/repos/michaelpipkin/pip-cost-sharing/issues';
  private token: string = githubConfig.personalAccessToken;

  async createIssue(title: string, body: string): Promise<object> {
    const issueData = { title, body, assignees: ['michaelpipkin'] };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(issueData),
    });

    if (!response.ok) {
      throw new Error(`Failed to create issue: ${response.statusText}`);
    }

    return response.json();
  }
}
