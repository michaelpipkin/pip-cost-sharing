import { vi } from 'vitest';

export const App = {
  addListener: vi.fn().mockResolvedValue(undefined),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
  getInfo: vi.fn().mockResolvedValue({ id: 'test', name: 'Test', build: '1', version: '1.0.0' }),
  getState: vi.fn().mockResolvedValue({ isActive: true }),
  getLaunchUrl: vi.fn().mockResolvedValue(undefined),
  minimizeApp: vi.fn().mockResolvedValue(undefined),
  exitApp: vi.fn().mockResolvedValue(undefined),
};

export interface URLOpenListenerEvent {
  url: string;
}
