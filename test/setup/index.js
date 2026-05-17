import { beforeEach, afterEach } from 'vitest';
import { installChromeShim, resetChromeShim } from './chrome.js';

installChromeShim();

beforeEach(() => {
  resetChromeShim();
});

afterEach(() => {
  resetChromeShim();
});
