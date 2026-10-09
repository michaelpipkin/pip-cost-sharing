import { vi } from 'vitest';

// Implementations are passed to vi.fn() rather than set with
// mockResolvedValue() so they survive vi.resetAllMocks() in other specs
// (same reasoning as capacitor-firebase-analytics.mock.ts).
export const FirebaseAppCheck = {
  initialize: vi.fn(
    (_options?: { isTokenAutoRefreshEnabled?: boolean }): Promise<void> =>
      Promise.resolve()
  ),
  getToken: vi.fn(
    (
      _options?: { forceRefresh?: boolean }
    ): Promise<{ token: string; expireTimeMillis?: number }> =>
      Promise.resolve({ token: 'mock-native-token', expireTimeMillis: 0 })
  ),
  setTokenAutoRefreshEnabled: vi.fn(
    (_options: { enabled: boolean }): Promise<void> => Promise.resolve()
  ),
};
