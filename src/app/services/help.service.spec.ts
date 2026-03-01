import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { githubConfig } from '@app/github.config';
import { HelpService } from './help.service';

// Note: The GitHub personal access token is currently hardcoded in github.config.ts.
// It should be stored in environment variables or a secret manager instead.

describe('HelpService', () => {
  let service: HelpService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    service = new HelpService();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
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
        expect.objectContaining({ method: 'POST' }),
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
        'Failed to create issue: Unauthorized',
      );
    });
  });
});
