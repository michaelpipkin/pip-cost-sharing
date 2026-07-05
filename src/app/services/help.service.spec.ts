import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as functionsModule from 'firebase/functions';
import { githubConfig } from '@app/github.config';
import { HelpService } from './help.service';

// Note: The GitHub personal access token is currently hardcoded in github.config.ts.
// It should be stored in environment variables or a secret manager instead.

const mockFunctions = {};

describe('HelpService', () => {
  let service: HelpService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let httpsCallableSpy: ReturnType<typeof vi.spyOn>;
  let callableFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HelpService,
        { provide: functionsModule.getFunctions, useValue: mockFunctions },
      ],
    });
    service = TestBed.inject(HelpService);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    callableFn = vi.fn().mockResolvedValue({ data: { success: true } });
    httpsCallableSpy = vi
      .spyOn(functionsModule, 'httpsCallable')
      .mockReturnValue(callableFn as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createIssue', () => {
    it('should POST to the GitHub issues API endpoint', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1 }),
      } as Response);

      await service.createIssue('Test Issue', 'Issue body');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.github.com/repos/michaelpipkin/pip-cost-sharing/issues',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should include Authorization header with the token', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1 }),
      } as Response);

      await service.createIssue('Test Issue', 'Issue body');

      const [, options] = fetchSpy.mock.calls[0]!;
      expect((options as RequestInit).headers).toMatchObject({
        Authorization: `token ${githubConfig.personalAccessToken}`,
      });
    });

    it('should send title, body, and assignee in the request payload', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1 }),
      } as Response);

      await service.createIssue('My Title', 'My Body');

      const [, options] = fetchSpy.mock.calls[0]!;
      const body = JSON.parse((options as RequestInit).body as string);
      expect(body).toEqual({
        title: 'My Title',
        body: 'My Body',
        assignees: ['michaelpipkin'],
      });
    });

    it('should return the parsed JSON response on success', async () => {
      const mockResponse = { id: 42, title: 'Test Issue' };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await service.createIssue('Test Issue', 'Issue body');
      expect(result).toEqual(mockResponse);
    });

    it('should throw an error when the response is not ok', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response);

      await expect(service.createIssue('Test', 'Body')).rejects.toThrow(
        'Failed to create issue: Unauthorized'
      );
    });
  });

  describe('notifyAdminOfIssue', () => {
    const issue = {
      number: 42,
      html_url: 'https://github.com/michaelpipkin/pip-cost-sharing/issues/42',
      title: 'Test Issue',
      body: 'Issue body',
    };

    it('should invoke the notifyNewIssue callable with the mapped issue fields', async () => {
      await service.notifyAdminOfIssue(
        issue,
        'Description text',
        'user@example.com'
      );

      expect(httpsCallableSpy).toHaveBeenCalledWith(
        mockFunctions,
        'notifyNewIssue'
      );
      expect(callableFn).toHaveBeenCalledWith({
        number: 42,
        url: 'https://github.com/michaelpipkin/pip-cost-sharing/issues/42',
        title: 'Test Issue',
        body: 'Description text',
        reporterEmail: 'user@example.com',
      });
    });

    it('should omit reporterEmail when not provided', async () => {
      await service.notifyAdminOfIssue(issue, 'Description text');

      expect(callableFn).toHaveBeenCalledWith({
        number: 42,
        url: issue.html_url,
        title: issue.title,
        body: 'Description text',
        reporterEmail: undefined,
      });
    });

    it('should propagate errors from the callable', async () => {
      callableFn.mockRejectedValueOnce(new Error('Callable failed'));

      await expect(
        service.notifyAdminOfIssue(issue, 'Description text')
      ).rejects.toThrow('Callable failed');
    });
  });
});
