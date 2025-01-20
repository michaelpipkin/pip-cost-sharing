import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { githubConfig } from '@app/github.config';
import { IHelpService } from './help.service.interface';

@Injectable({
  providedIn: 'root',
})
export class HelpService implements IHelpService {
  http = inject(HttpClient);

  private apiUrl =
    'https://api.github.com/repos/michaelpipkin/pip-cost-sharing/issues';
  private token: string = githubConfig.personalAccessToken;

  createIssue(title: string, body: string) {
    const headers = new HttpHeaders({
      Authorization: `token ${this.token}`,
    });

    const issueData = { title, body, assignees: ['michaelpipkin'] };

    return this.http.post<object>(this.apiUrl, issueData, { headers });
  }
}
