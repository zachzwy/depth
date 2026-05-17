// Service-worker integration tests for hosted mode. Verifies that
// handleGenerate routes to the hosted endpoint (not the OpenAI-compatible
// streamMessage path) when `providerMode === 'hosted'`, and that hosted error
// codes (LIMIT_REACHED, etc.) flow through to the panel verbatim.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setSettings, providerFingerprint } from '../../src/lib/settings.js';

function makePort(name = 'depth-generate') {
  const messageListeners = new Set();
  const disconnectListeners = new Set();
  const posted = [];
  return {
    name,
    posted,
    onMessage: {
      addListener: (fn) => messageListeners.add(fn),
      removeListener: (fn) => messageListeners.delete(fn),
    },
    onDisconnect: {
      addListener: (fn) => disconnectListeners.add(fn),
      removeListener: (fn) => disconnectListeners.delete(fn),
    },
    postMessage: (msg) => posted.push(msg),
    disconnect() {
      for (const fn of disconnectListeners) fn();
    },
    fire(msg) {
      for (const fn of messageListeners) fn(msg);
    },
  };
}

function sseResponse(text) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

async function waitFor(predicate, { timeout = 1000, interval = 5 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('waitFor timeout');
}

async function importWorker() {
  globalThis.chrome._connectListeners.clear();
  globalThis.chrome._messageListeners.clear();
  vi.resetModules();
  return import('../../src/background/service-worker.js');
}

async function fireConnect(port) {
  const listeners = [...globalThis.chrome._connectListeners];
  for (const fn of listeners) fn(port);
}

const FULL_DOC = {
  glance: { sentence: 'hi', confidence: 'high', evidence: '' },
  summary: { bullets: [] },
  read: { sections: [] },
  keyTerms: [],
};

async function configureHostedSettings({ consented = true } = {}) {
  const next = {
    providerMode: 'hosted',
    hostedBaseUrl: 'http://localhost:54321/functions/v1',
    preferredLanguage: 'English',
  };
  const fp = providerFingerprint(next);
  await setSettings({
    ...next,
    consented,
    consentedProviderFingerprint: consented ? fp : '',
    // Pre-seed a non-expired anon session so ensureHostedSession short-
    // circuits and the test's mock fetch only has to handle the function
    // call, not /auth/v1/signup.
    hostedAccessToken: 'test-token',
    hostedAccessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
    hostedSubjectId: 'test-subject',
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

describe('service-worker handleGenerate in hosted mode', () => {
  it('routes to the hosted endpoint and forwards partials/done', async () => {
    await configureHostedSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);

    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(
        frame('started', { requestId: 'r1', cacheKey: 'c1' }) +
          frame('partial', { glance: FULL_DOC.glance }) +
          frame('done', FULL_DOC),
      ),
    );

    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body' });
    await waitFor(() => port.posted.some((m) => m.type === 'done'));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:54321/functions/v1/generate',
      expect.objectContaining({ method: 'POST' }),
    );
    const done = port.posted.find((m) => m.type === 'done');
    expect(done.data).toEqual(FULL_DOC);
    expect(port.posted.some((m) => m.type === 'partial')).toBe(true);
  });

  it('forwards LIMIT_REACHED through to the panel with upgradeUrl', async () => {
    await configureHostedSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);

    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(
        frame('started', { requestId: 'r1', cacheKey: 'c1' }) +
          frame('error', {
            code: 'LIMIT_REACHED',
            message: 'Daily free quota reached.',
            upgradeUrl: 'https://depth.app/upgrade',
          }),
      ),
    );

    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body' });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    const err = port.posted.find((m) => m.type === 'error');
    expect(err.code).toBe('LIMIT_REACHED');
    expect(err.message).toBe('Daily free quota reached.');
    expect(err.upgradeUrl).toBe('https://depth.app/upgrade');
  });

  it('serves a cached hosted document on a second request', async () => {
    await configureHostedSettings();
    await importWorker();

    let port = makePort();
    await fireConnect(port);
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(
        frame('started', { requestId: 'r1', cacheKey: 'c1' }) + frame('done', FULL_DOC),
      ),
    );
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body' });
    await waitFor(() => port.posted.some((m) => m.type === 'done'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    port = makePort();
    await fireConnect(port);
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body' });
    await waitFor(() => port.posted.some((m) => m.type === 'done'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const done = port.posted.find((m) => m.type === 'done');
    expect(done.fromCache).toBe(true);
  });

  it('does not configure as ready if hostedBaseUrl is empty', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: '',
      preferredLanguage: 'English',
      consented: true,
      consentedProviderFingerprint: providerFingerprint({
        providerMode: 'hosted',
        hostedBaseUrl: '',
        preferredLanguage: 'English',
      }),
    });
    await importWorker();
    const port = makePort();
    await fireConnect(port);
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body' });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    expect(port.posted.find((m) => m.type === 'error').code).toBe('NO_API_KEY');
  });
});
