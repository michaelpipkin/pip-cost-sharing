import { vi } from 'vitest';

// The real @capacitor/browser export is a lazy proxy whose methods can't be
// spied on (no own "open" property), so specs get this plain object instead
// via tsconfig.spec.json's paths. Implementation passed to vi.fn() so it
// survives vi.resetAllMocks() (same reasoning as the other Capacitor mocks).
export const Browser = {
  open: vi.fn((_options: { url: string }): Promise<void> => Promise.resolve()),
  close: vi.fn((): Promise<void> => Promise.resolve()),
};
