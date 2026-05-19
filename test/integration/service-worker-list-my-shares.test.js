// Service-worker depth:list-my-shares handler. Exercises the GET
// /share-summary/mine path with global fetch mocked.

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

async function setupSession({ token = 'permanent-at' } = {}) {
  await setSettings({
    providerMode: 'hosted',
    hostedBaseUrl: HOSTED,
    hostedAnonKey: 'anon-key',
    hostedAccessToken: token,
    hostedRefreshToken: 'rt',
    hostedAccessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
    hostedSubjectId: 'user-1',
    hostedIsAnonymous: false,
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

describe('depth:list-my-shares handler', () => {
  it('returns {ok:true, versions} on a successful list', async () => {
    await setupSession();
    const versions = [
      {
        slug: 'aaaaAAAA',
        url: 'https://example.com/a',
        title: 'A',
        createdAt: '2026-05-01T00:00:00Z',
        viewCount: 3,
        isHidden: false,
      },
      {
        slug: 'bbbbBBBB',
        url: 'https://example.com/b',
        title: 'B',
        createdAt: '2026-05-02T00:00:00Z',
        viewCount: 0,
        isHidden: true,
      },
    ];
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ versions }));

    await importWorker();
    const reply = await fireMessage({ type: 'depth:list-my-shares' });

    expect(reply).toEqual({ ok: true, versions });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${HOSTED}/share-summary/mine`);
    expect(init.method).toBe('GET');
    expect(init.headers.authorization).toBe('Bearer permanent-at');
  });

  it('passes through SIGNED_OUT (401) errors', async () => {
    await setupSession();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse(
        { code: 'SIGNED_OUT', message: 'Access token is invalid or expired.' },
        { status: 401 },
      ),
    );

    await importWorker();
    const reply = await fireMessage({ type: 'depth:list-my-shares' });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('SIGNED_OUT');
  });
});
