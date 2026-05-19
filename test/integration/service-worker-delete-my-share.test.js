// Service-worker depth:delete-my-share handler. Exercises the DELETE
// /share-summary/:slug path with global fetch mocked.

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

describe('depth:delete-my-share handler', () => {
  it('returns {ok:true} and issues a DELETE with the slug', async () => {
    await setupSession();
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await importWorker();
    const reply = await fireMessage({ type: 'depth:delete-my-share', slug: 'aBcDeFgH' });

    expect(reply).toEqual({ ok: true });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${HOSTED}/share-summary/aBcDeFgH`);
    expect(init.method).toBe('DELETE');
    expect(init.headers.authorization).toBe('Bearer permanent-at');
  });

  it('surfaces NOT_FOUND when the slug is not the caller\'s', async () => {
    await setupSession();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse(
        { code: 'NOT_FOUND', message: 'No matching summary to delete.' },
        { status: 404 },
      ),
    );

    await importWorker();
    const reply = await fireMessage({ type: 'depth:delete-my-share', slug: 'aBcDeFgH' });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('NOT_FOUND');
  });

  it('refuses an empty slug without hitting the network', async () => {
    await setupSession();
    await importWorker();
    const reply = await fireMessage({ type: 'depth:delete-my-share', slug: '' });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('BAD_SLUG');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
