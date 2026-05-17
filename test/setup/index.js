import { beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim, resetChromeShim } from './chrome.js';

installChromeShim();

beforeEach(() => {
  resetChromeShim();
  vi.clearAllMocks();
});

afterEach(() => {
  resetChromeShim();
});
