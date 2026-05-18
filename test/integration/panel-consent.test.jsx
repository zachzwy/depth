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
import { setSettings, providerFingerprint, PROVIDERS } from '../../src/lib/settings.js';

const pageMeta = { title: 'A Test Article', url: 'https://example.com/article' };

async function configure({ consented = false } = {}) {
  const next = {
    providerMode: 'custom',
    providerId: 'openrouter',
    apiKey: 'sk-test',
    model: 'openai/gpt-4.1-mini',
    preferredLanguage: 'English',
  };
  await setSettings({
    ...next,
    consented,
    consentedProviderFingerprint: consented ? providerFingerprint(next) : '',
  });
}

function makePort() {
  return {
    name: 'depth-generate',
    posted: [],
    postMessage(msg) { this.posted.push(msg); },
    onMessage: { addListener: () => {}, removeListener: () => {} },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
    disconnect: vi.fn(),
  };
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  chrome.permissions._grant(PROVIDERS.openrouter.hostPermission);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('Panel consent flow', () => {
  it('shows ConsentModal when configured but not consented', async () => {
    await configure({ consented: false });
    chrome.runtime.connect.mockImplementation(() => makePort());

    render(<Panel pageMeta={pageMeta} onClose={() => {}} />);
    await flush();

    expect(screen.getByText(/Send this page to OpenRouter/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeTruthy();
  });

  it('opens a generation port after the user clicks Continue', async () => {
    await configure({ consented: false });
    const port = makePort();
    chrome.runtime.connect.mockImplementation(() => port);

    render(<Panel pageMeta={pageMeta} onClose={() => {}} />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }));
    await flush();

    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'depth-generate' });
    expect(port.posted[0]).toMatchObject({
      type: 'start',
      title: 'A Test Article',
      url: 'https://example.com/article',
      text: expect.stringContaining('Body text'),
    });
  });

  it('shows SetupView when generation is not configured', async () => {
    // Custom mode with no API key / model → unconfigured.
    await setSettings({ providerMode: 'custom' });
    chrome.runtime.connect.mockImplementation(() => makePort());

    render(<Panel pageMeta={pageMeta} onClose={() => {}} />);
    await flush();

    expect(screen.getByText(/Set up Depth/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open Settings/i })).toBeTruthy();
    expect(chrome.runtime.connect).not.toHaveBeenCalled();
  });
});
