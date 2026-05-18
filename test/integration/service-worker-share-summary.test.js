// Service-worker depth:share-summary message handler. Exercises the
// POST /share-summary path end-to-end via the chrome shim's message
// fan-out, with global fetch mocked. We don't boot the real backend —
// we just verify the SW assembles the request correctly and surfaces
// the response (success + error) back to the panel.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSettings, setSettings } from '../../src/lib/settings.js';

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

describe('depth:share-summary handler', () => {
  const PAYLOAD = {
    keyTerms: [{ term: 'X', definition: 'a thing' }],
    glance: { sentence: 'A glance.' },
    summary: { bullets: ['b'] },
    read: { sections: [{ heading: 'H', body: 'B' }] },
  };

  it('returns {ok:true, slug, shareUrl} and stamps consent on first publish', async () => {
    await setupSession();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse(
        { slug: 'abcdEFGH', shareUrl: 'https://depth.microfalls.com/s/abcdEFGH' },
        { status: 201 },
      ),
    );

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:share-summary',
      url: 'https://example.com/a',
      title: 'A Test',
      articleHash: 'h',
      payload: PAYLOAD,
    });

    expect(reply).toMatchObject({
      ok: true,
      slug: 'abcdEFGH',
      shareUrl: 'https://depth.microfalls.com/s/abcdEFGH',
    });
    const fetched = globalThis.fetch.mock.calls[0];
    expect(fetched[0]).toBe(`${HOSTED}/share-summary`);
    expect(fetched[1].method).toBe('POST');
    expect(fetched[1].headers.authorization).toBe('Bearer permanent-at');
    const body = JSON.parse(fetched[1].body);
    expect(body.url).toBe('https://example.com/a');
    expect(body.title).toBe('A Test');
    expect(body.payload).toEqual(PAYLOAD);

    // After a successful first publish, settings.communityPublishConsentAt
    // should be set so the panel doesn't re-show the consent modal.
    const settings = await getSettings();
    expect(settings.communityPublishConsentAt).toBeGreaterThan(0);
  });

  it("doesn't stamp consent again on subsequent publishes", async () => {
    await setupSession();
    const stampedAt = Date.now() - 5000;
    await setSettings({ communityPublishConsentAt: stampedAt });
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse(
        { slug: 'zzzz0000', shareUrl: 'https://depth.microfalls.com/s/zzzz0000' },
        { status: 201 },
      ),
    );

    await importWorker();
    await fireMessage({
      type: 'depth:share-summary',
      url: 'https://example.com/a',
      title: 'A Test',
      articleHash: 'h',
      payload: PAYLOAD,
    });

    const settings = await getSettings();
    expect(settings.communityPublishConsentAt).toBe(stampedAt);
  });

  it('surfaces BAD_HOST from the backend back to the caller', async () => {
    await setupSession();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse(
        { code: 'BAD_HOST', message: "This page can't be shared.", details: 'private-host' },
        { status: 400 },
      ),
    );

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:share-summary',
      url: 'https://docs.google.com/document/d/abc',
      title: 'A Test',
      articleHash: 'h',
      payload: PAYLOAD,
    });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('BAD_HOST');
    expect(reply.details).toBe('private-host');
  });

  it('returns RATE_LIMITED through unchanged on 429', async () => {
    await setupSession();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse(
        { code: 'RATE_LIMITED', message: 'Daily publish limit reached.' },
        { status: 429 },
      ),
    );

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:share-summary',
      url: 'https://example.com/b',
      title: 'B',
      articleHash: 'h',
      payload: PAYLOAD,
    });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('RATE_LIMITED');
  });
});
