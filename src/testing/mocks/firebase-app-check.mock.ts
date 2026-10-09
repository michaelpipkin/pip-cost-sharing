import { vi } from 'vitest';

// ──────────────────────────────────────────────
// Type definitions
// ──────────────────────────────────────────────

export interface AppCheck {
  app: unknown;
}

export interface AppCheckTokenResult {
  token: string;
}

// ──────────────────────────────────────────────
// Mock classes
// ──────────────────────────────────────────────

export class ReCaptchaEnterpriseProvider {
  constructor(public siteKey: string) {}
}

export class CustomProvider {
  constructor(
    public customProviderOptions: {
      getToken: () => Promise<{ token: string; expireTimeMillis: number }>;
    }
  ) {}
}

// ──────────────────────────────────────────────
// Mock functions
// ──────────────────────────────────────────────

export const initializeAppCheck: (
  app: any,
  options: any
) => AppCheck = vi.fn().mockReturnValue({ app: {} }) as any;

export const getToken: (
  appCheck: AppCheck,
  forceRefresh?: boolean
) => Promise<AppCheckTokenResult> = vi
  .fn()
  .mockResolvedValue({ token: 'mock-app-check-token' }) as any;
