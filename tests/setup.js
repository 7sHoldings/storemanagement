// Vitest global setup: jest-dom matchers + a stable system clock so any
// test that builds a date string against "today" doesn't flake at month
// boundaries.

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Pin "now" to mid-May 2026 (day 12 of 31) — this matches the dates used
// throughout the lib/buying-pacing tests so projections are deterministic.
const FROZEN_NOW = new Date('2026-05-12T15:00:00Z');

beforeAll(() => {
  vi.useFakeTimers({ now: FROZEN_NOW, toFake: ['Date'] });
});

afterAll(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
});

// matchMedia isn't implemented in jsdom — stub it so components that read
// the viewport (e.g. the Daily Sales view-mode default) don't blow up.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
