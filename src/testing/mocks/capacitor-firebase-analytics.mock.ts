import { vi } from 'vitest';

export const FirebaseAnalytics = {
  logEvent: vi.fn().mockResolvedValue(undefined),
  setUserId: vi.fn().mockResolvedValue(undefined),
  setUserProperty: vi.fn().mockResolvedValue(undefined),
  setEnabled: vi.fn().mockResolvedValue(undefined),
};
