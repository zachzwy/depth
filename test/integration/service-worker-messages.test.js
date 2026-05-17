// Service-worker chrome.runtime.onMessage handlers — non-port flows.
// Covers depth:open-checkout, depth:open-options, depth:probe-quiz.

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
    // The SW handler returns `true` to keep the channel open and calls
    // sendResponse asynchronously. Our shim matches that contract.
    listeners[0](msg, /* sender */ {}, resolve);
  });
}

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
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

describe('depth:open-checkout message handler', () => {
  it('returns {ok:true, url} on success and opens the Stripe URL', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: 'http://localhost:54321/functions/v1',
      hostedAnonKey: 'anon-key',
      hostedAccessToken: 'permanent-at',
      hostedRefreshToken: 'permanent-rt',
      hostedAccessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      hostedSubjectId: 'user-1',
      hostedIsAnonymous: false,
      hostedEmail: 'a@b.co',
    });
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ url: 'https://checkout.stripe.com/cs_1', sessionId: 'cs_1' }),
    );

    await importWorker();
    const reply = await fireMessage({ type: 'depth:open-checkout' });
    expect(reply).toEqual({ ok: true, url: 'https://checkout.stripe.com/cs_1' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://checkout.stripe.com/cs_1',
    });
  });

  it('returns {ok:false, code, message} when the user is anonymous', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: 'http://localhost:54321/functions/v1',
      hostedAnonKey: 'anon-key',
      hostedIsAnonymous: true,
    });

    await importWorker();
    const reply = await fireMessage({ type: 'depth:open-checkout' });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('SIGNED_OUT');
  });

  it('returns {ok:false, code} when the server rejects checkout', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: 'http://localhost:54321/functions/v1',
      hostedAnonKey: 'anon-key',
      hostedAccessToken: 'permanent-at',
      hostedRefreshToken: 'permanent-rt',
      hostedAccessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      hostedSubjectId: 'user-1',
      hostedIsAnonymous: false,
    });
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse(
        { code: 'UPSTREAM_FAILED', message: 'Stripe not configured.' },
        { status: 501 },
      ),
    );

    await importWorker();
    const reply = await fireMessage({ type: 'depth:open-checkout' });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('UPSTREAM_FAILED');
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});

describe('depth:open-options message handler', () => {
  it('opens the options page', async () => {
    await importWorker();
    fireMessage({ type: 'depth:open-options' });
    // openOptionsPage is the fast path the SW prefers.
    // (Either way, the listener returns without errors.)
    // Give the async machinery a tick to settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.runtime.openOptionsPage.mock.calls.length >= 1 || chrome.tabs.create.mock.calls.length >= 1).toBe(true);
  });
});

describe('depth:probe-quiz message handler', () => {
  it('replies with {cached: false} when no cache entry exists', async () => {
    await setSettings({
      providerMode: 'custom',
      providerId: 'openrouter',
      apiKey: 'sk-x',
      model: 'openai/gpt-4o-mini',
      preferredLanguage: 'English',
    });
    await importWorker();
    const reply = await fireMessage({
      type: 'depth:probe-quiz',
      title: 'T',
      text: 'body text',
    });
    expect(reply).toEqual({ cached: false });
  });
});
