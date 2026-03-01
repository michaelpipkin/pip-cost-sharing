import { vi } from 'vitest';

export const getFunctions = vi.fn().mockReturnValue({}) as any;
export const httpsCallable: <RequestData = unknown, ResponseData = unknown>(
  fn: any,
  name: string,
  options?: any,
) => (data?: RequestData) => Promise<{ data: ResponseData }> =
  vi.fn().mockReturnValue(vi.fn().mockResolvedValue({ data: {} })) as any;
export const connectFunctionsEmulator = vi.fn() as any;
