import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const extractMock = vi.fn();
vi.mock('../../src/content/extractor.js', () => ({
  extractPage: (...args) => extractMock(...args),
}));

import { render, screen, cleanup, fireEvent } from '@testing-library/preact';
import Panel from '../../src/content/panel/Panel.jsx';
import { setSettings, providerFingerprint, PROVIDERS } from '../../src/lib/settings.js';

const pageMeta = { title: 'X / Home', url: 'https://x.com/home' };

async function configure() {
  const next = {
    providerMode: 'custom',
    providerId: 'openrouter',
    apiKey: 'sk-test',
    model: 'openai/gpt-4.1-mini',
    preferredLanguage: 'English',
  };
  await setSettings({
    ...next,
    consented: true,
    consentedProviderFingerprint: providerFingerprint(next),
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

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  chrome.permissions._grant(PROVIDERS.openrouter.hostPermission);
  extractMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Panel unsupported-page gate', () => {
  it('shows the refusal card on a feed page and does NOT open a port', async () => {
    await configure();
    chrome.runtime.connect.mockImplementation(() => makePort());
    extractMock.mockReturnValue({
      title: 'X / Home',
      byline: null,
      siteName: null,
      text: '',
      wordCount: 0,
      truncated: false,
      classification: { kind: 'feed' },
    });

    render(<Panel pageMeta={pageMeta} onClose={() => {}} />);
    await flush();

    expect(screen.getByText(/This looks like a feed/i)).toBeTruthy();
    expect(chrome.runtime.connect).not.toHaveBeenCalled();
  });

  it('shows the discussion variant on HN item pages', async () => {
    await configure();
    chrome.runtime.connect.mockImplementation(() => makePort());
    extractMock.mockReturnValue({
      title: 'Show HN: thing | Hacker News',
      byline: null,
      siteName: null,
      text: 'Some comments here. '.repeat(40),
      wordCount: 120,
      truncated: false,
      classification: { kind: 'discussion' },
    });

    render(<Panel pageMeta={{ title: 'HN', url: 'https://news.ycombinator.com/item?id=1' }} onClose={() => {}} />);
    await flush();

    expect(screen.getByText(/discussion thread/i)).toBeTruthy();
    expect(chrome.runtime.connect).not.toHaveBeenCalled();
  });

  it('bypasses the refusal and opens a port when Try anyway is clicked', async () => {
    await configure();
    const port = makePort();
    chrome.runtime.connect.mockImplementation(() => port);
    extractMock.mockReturnValue({
      title: 'X / Home',
      byline: null,
      siteName: null,
      text: 'Stub content to send. '.repeat(40),
      wordCount: 120,
      truncated: false,
      classification: { kind: 'feed' },
    });

    render(<Panel pageMeta={pageMeta} onClose={() => {}} />);
    await flush();

    fireEvent.click(screen.getByText(/Try anyway/i));
    await flush();

    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'depth-generate' });
    expect(port.posted[0]).toMatchObject({
      type: 'start',
      title: 'X / Home',
      url: 'https://x.com/home',
    });
  });

  it('does not refuse on an article-classified page', async () => {
    await configure();
    const port = makePort();
    chrome.runtime.connect.mockImplementation(() => port);
    extractMock.mockReturnValue({
      title: 'A real article',
      byline: null,
      siteName: null,
      text: 'Real article body. '.repeat(40),
      wordCount: 120,
      truncated: false,
      classification: { kind: 'article' },
    });

    render(<Panel pageMeta={{ title: 'A real article', url: 'https://example.com/post' }} onClose={() => {}} />);
    await flush();

    expect(screen.queryByText(/looks like a feed/i)).toBeNull();
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'depth-generate' });
  });
});
