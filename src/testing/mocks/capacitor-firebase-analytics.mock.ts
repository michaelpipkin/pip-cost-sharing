import { vi } from 'vitest';

// Implementations are passed to vi.fn() rather than set with
// mockResolvedValue() so they survive vi.resetAllMocks() in other specs,
// which restores each mock to its original implementation. Without this,
// a reset leaves logEvent returning undefined and AnalyticsService's
// `.catch()` on it throws.
const resolved = (..._args: unknown[]): Promise<void> => Promise.resolve();

export const FirebaseAnalytics = {
  logEvent: vi.fn(resolved),
  setUserId: vi.fn(resolved),
  setUserProperty: vi.fn(resolved),
  setEnabled: vi.fn(resolved),
};
