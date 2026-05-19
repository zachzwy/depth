// Service-worker depth:probe-community and depth:fetch-community-summary
// message handlers. These back the panel's consume-side quota hook
// (phase 7) — probe gives the panel a versions count, fetch returns
// the full payload when the user picks Use latest.
//
// We mock global fetch and exercise the handlers via the chrome shim's
// message fan-out — no live backend.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setSettings } from '../../src/lib/settings.js';

async function importWorker() {
  globalThis.chrome._connectListeners.clear();
  globalThis.chrome._messageListeners.clear();
  vi.resetModules();
  return import('../../src/background/service-worker.js');
}

function fireMessage(msg) {
  return new Promise((resolve) => {
    const listeners = [...globalThis.chrome._messageListeners];
    if (listeners.length === 0) {
      resolve(undefined);
      return;
    }
    listeners[0](msg, {}, resolve);
  });
}

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const HOSTED = 'http://localhost:54321/functions/v1';

async function setupHosted({ useCache = true } = {}) {
  await setSettings({
    providerMode: 'hosted',
    hostedBaseUrl: HOSTED,
    hostedAnonKey: 'anon-key',
    hostedAccessToken: 'at',
    hostedAccessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
    hostedSubjectId: 'user-1',
    hostedIsAnonymous: false,
    communityUseCache: useCache,
  });
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  chrome.permissions._grant('http://localhost:54321/*');
  vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('depth:probe-community handler', () => {
  it('returns versions[] from /community-summary?url=', async () => {
    await setupHosted();
    const versions = [
      { slug: 'aaaaAAAA', title: 'A', createdAt: '2026-05-18T10:00:00Z', viewCount: 0 },
      { slug: 'bbbbBBBB', title: 'B', createdAt: '2026-05-18T09:00:00Z', viewCount: 0 },
    ];
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ versions }));

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:probe-community',
      url: 'https://example.com/a',
    });
    expect(reply.versions).toHaveLength(2);
    expect(reply.versions[0].slug).toBe('aaaaAAAA');
    const fetched = globalThis.fetch.mock.calls[0];
    expect(String(fetched[0])).toContain('/community-summary?url=');
    expect(String(fetched[0])).toContain(encodeURIComponent('https://example.com/a'));
  });

  it('returns empty versions[] when communityUseCache is off (no network call)', async () => {
    await setupHosted({ useCache: false });

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:probe-community',
      url: 'https://example.com/a',
    });
    expect(reply.versions).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns empty versions[] on fetch failure (graceful fallback)', async () => {
    await setupHosted();
    globalThis.fetch.mockRejectedValueOnce(new Error('network down'));

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:probe-community',
      url: 'https://example.com/a',
    });
    expect(reply.versions).toEqual([]);
  });
});

describe('depth:probe-cache-13 handler', () => {
  it('returns {cached:false} when nothing is stored', async () => {
    await setupHosted();

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:probe-cache-13',
      title: 'A',
      text: 'body',
    });
    expect(reply).toEqual({ cached: false });
  });

  it('returns {cached:true, data} when the same title+text is cached', async () => {
    await setupHosted();

    // Use the same contentHash + setCached the SW uses internally so we
    // exercise the real cache path rather than reaching into storage by
    // hand-rolled keys.
    const { contentHash } = await import('../../src/lib/content-hash.js');
    const { providerFingerprint } = await import('../../src/lib/settings.js');
    const { PROMPT_VERSION } = await import('../../src/lib/prompts.js');
    const { setCached } = await import('../../src/background/cache.js');
    const settings = await (await import('../../src/lib/settings.js')).getSettings();
    const hash = await contentHash('A', 'body', providerFingerprint(settings), PROMPT_VERSION, 'article');
    const stored = {
      keyTerms: [],
      glance: { sentence: 's' },
      summary: { bullets: ['b'] },
      read: { sections: [{ heading: 'h', paragraphs: ['p'] }] },
    };
    await setCached(hash, stored, '1-3');

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:probe-cache-13',
      title: 'A',
      text: 'body',
    });
    expect(reply.cached).toBe(true);
    expect(reply.data).toEqual(stored);
  });
});

describe('depth:fetch-community-summary handler', () => {
  it('returns {ok:true, ...row} on a hit', async () => {
    await setupHosted();
    const row = {
      slug: 'aaaaAAAA',
      url: 'https://example.com/a',
      title: 'A',
      createdAt: '2026-05-18T10:00:00Z',
      viewCount: 1,
      payload: {
        keyTerms: [],
        glance: { sentence: 's' },
        summary: { bullets: ['b'] },
        read: { sections: [{ heading: 'h', paragraphs: ['p'] }] },
      },
    };
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(row));

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:fetch-community-summary',
      slug: 'aaaaAAAA',
    });
    expect(reply.ok).toBe(true);
    expect(reply.slug).toBe('aaaaAAAA');
    expect(reply.payload).toEqual(row.payload);
  });

  it('returns {ok:false, code:NOT_FOUND} on 404', async () => {
    await setupHosted();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ code: 'NOT_FOUND', message: 'gone' }, { status: 404 }),
    );

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:fetch-community-summary',
      slug: 'zzzzZZZZ',
    });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('NOT_FOUND');
  });
});
