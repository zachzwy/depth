// Drives the Panel into the LIMIT_REACHED state by simulating the
// service-worker response that handleGenerate produces when the hosted client
// throws a HostedError with code='LIMIT_REACHED'. Asserts that:
//   1. PaywallCard renders (not ErrorState).
//   2. Upgrade link uses the backend-supplied upgradeUrl.
//   3. Clicking "Use your own API key" flips providerMode to 'custom' and
//      opens the options page.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/content/extractor.js', () => ({
  extractPage: () => ({
    title: 'A Test Article',
    byline: null,
    siteName: null,
    text: 'Body text long enough. '.repeat(40),
    wordCount: 120,
    truncated: false,
    classification: { kind: 'article' },
  }),
}));

import { render, screen, cleanup, fireEvent } from '@testing-library/preact';
import Panel from '../../src/content/panel/Panel.jsx';
import { setSettings, providerFingerprint } from '../../src/lib/settings.js';

const pageMeta = { title: 'A Test Article', url: 'https://example.com/article' };

function makeControllablePort() {
  const listeners = new Set();
  return {
    name: 'depth-generate',
    posted: [],
    postMessage(msg) { this.posted.push(msg); },
    onMessage: {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
    },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
    disconnect: vi.fn(),
    fire(msg) {
      for (const fn of listeners) fn(msg);
    },
  };
}

async function configureHosted({ anonymous = false } = {}) {
  const next = {
    providerMode: 'hosted',
    hostedBaseUrl: 'http://localhost:54321/functions/v1',
    preferredLanguage: 'English',
    hostedIsAnonymous: anonymous,
  };
  await setSettings({
    ...next,
    consented: true,
    consentedProviderFingerprint: providerFingerprint(next),
  });
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  chrome.permissions._grant('http://localhost:54321/*');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Panel paywall (LIMIT_REACHED) flow', () => {
  it('renders the paywall card with the backend-supplied upgrade URL', async () => {
    await configureHosted();
    const port = makeControllablePort();
    chrome.runtime.connect.mockImplementation(() => port);

    render(<Panel pageMeta={pageMeta} onClose={() => {}} />);
    await flush();

    port.fire({
      type: 'error',
      code: 'LIMIT_REACHED',
      message: 'Daily free quota reached.',
      upgradeUrl: 'https://depth.app/upgrade',
    });
    await flush();

    expect(screen.getByRole('heading', { name: /quota reached/i })).toBeTruthy();
    const upgradeLink = screen.getByRole('link', { name: /Upgrade/ });
    expect(upgradeLink.getAttribute('href')).toBe('https://depth.app/upgrade');
    expect(upgradeLink.getAttribute('target')).toBe('_blank');
  });

  it('anonymous users see a Sign in CTA that messages the SW', async () => {
    await configureHosted({ anonymous: true });
    const port = makeControllablePort();
    chrome.runtime.connect.mockImplementation(() => port);
    const sendMessageSpy = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({ ok: true });

    render(<Panel pageMeta={pageMeta} onClose={() => {}} />);
    await flush();

    port.fire({
      type: 'error',
      code: 'LIMIT_REACHED',
      message: 'Daily free quota reached.',
      upgradeUrl: 'https://depth.app/upgrade',
    });
    await flush();

    expect(screen.queryByRole('link', { name: /Upgrade/ })).toBeNull();
    const signInBtn = screen.getByRole('button', { name: /Sign in/i });
    expect(signInBtn).toBeTruthy();
    expect(screen.getByText(/Sign in to get more daily quota/i)).toBeTruthy();

    fireEvent.click(signInBtn);
    await flush();
    expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'depth:sign-in' });
  });

  it('"Use your own API key" flips providerMode to custom and opens settings', async () => {
    await configureHosted();
    const port = makeControllablePort();
    chrome.runtime.connect.mockImplementation(() => port);
    const sendMessageSpy = vi.spyOn(chrome.runtime, 'sendMessage');

    render(<Panel pageMeta={pageMeta} onClose={() => {}} />);
    await flush();

    port.fire({
      type: 'error',
      code: 'LIMIT_REACHED',
      message: 'Daily free quota reached.',
      upgradeUrl: 'https://depth.app/upgrade',
    });
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /Use your own API key/i }));
    await flush();

    const stored = await chrome.storage.local.get(null);
    expect(stored.providerMode).toBe('custom');
    expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'depth:open-options' });
    expect(port.disconnect).toHaveBeenCalled();
  });

  it('falls back to ErrorState (not paywall) for non-paywall error codes', async () => {
    await configureHosted();
    const port = makeControllablePort();
    chrome.runtime.connect.mockImplementation(() => port);

    render(<Panel pageMeta={pageMeta} onClose={() => {}} />);
    await flush();

    port.fire({
      type: 'error',
      code: 'API_ERROR',
      message: 'Something broke.',
    });
    await flush();

    expect(screen.queryByRole('button', { name: /Use your own API key/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeTruthy();
  });
});
