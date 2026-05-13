// Reusable mock for `next/navigation`. Component tests can override the
// returned values via vi.mocked(...) if needed.

import { vi } from 'vitest';

export const mockPush = vi.fn();
export const mockReplace = vi.fn();
export const mockRefresh = vi.fn();
export const mockBack = vi.fn();

let __pathname = '/';
export const setMockPathname = (p) => { __pathname = p; };

export const useRouter = () => ({
  push: mockPush,
  replace: mockReplace,
  refresh: mockRefresh,
  back: mockBack,
  prefetch: vi.fn(),
});
export const usePathname = () => __pathname;
export const useSearchParams = () => new URLSearchParams('');

export const resetNavMocks = () => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockBack.mockReset();
  __pathname = '/';
};
