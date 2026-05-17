import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setSettings, providerFingerprint, PROVIDERS } from '../../src/lib/settings.js';
import { contentHash } from '../../src/lib/content-hash.js';
import { PROMPT_VERSION } from '../../src/lib/prompts.js';

function makePort(name = 'depth-dive') {
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

function sseResponse(events) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const e of events) {
        const line = typeof e === 'string' ? e : `data: ${JSON.stringify(e)}\n\n`;
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const delta = (content) => ({ choices: [{ delta: { content } }] });

async function waitFor(predicate, { timeout = 1000, interval = 5 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('waitFor timeout');
}

async function importWorker() {
  // Clear stale listeners from prior tests so each test has exactly one
  // handleDive bound to the freshly-imported module.
  globalThis.chrome._connectListeners.clear();
  globalThis.chrome._messageListeners.clear();
  vi.resetModules();
  return import('../../src/background/service-worker.js');
}

async function fireConnect(port) {
  const listeners = [...globalThis.chrome._connectListeners];
  for (const fn of listeners) fn(port);
}

const SUMMARY = {
  glance: { sentence: 'central claim', confidence: 'high', evidence: '' },
  summary: { bullets: ['b1', 'b2'] },
  read: { sections: [] },
  keyTerms: [],
};

const OPENING_TURN = {
  message: 'What do you make of the central claim?',
  suggestedReplies: ['agree', 'doubt', 'apply'],
};

const SECOND_TURN = {
  message: 'And what would change your mind?',
  suggestedReplies: ['data', 'counterexample', 'authority'],
};

beforeEach(async () => {
  await chrome.storage.local.clear();
  chrome.permissions._grant(PROVIDERS.openrouter.hostPermission);
  vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function configureSettings({ consented = true } = {}) {
  const next = {
    providerMode: 'custom',
    providerId: 'openrouter',
    apiKey: 'sk-test',
    model: 'openai/gpt-4.1-mini',
    preferredLanguage: 'English',
  };
  const fp = providerFingerprint(next);
  await setSettings({
    ...next,
    consented,
    consentedProviderFingerprint: consented ? fp : '',
  });
}

describe('service-worker handleDive', () => {
  it('streams an opening turn and posts turn-done', async () => {
    await configureSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);

    globalThis.fetch.mockResolvedValueOnce(
      sseResponse([
        delta(JSON.stringify(OPENING_TURN).slice(0, 20)),
        delta(JSON.stringify(OPENING_TURN).slice(20)),
        'data: [DONE]\n\n',
      ]),
    );

    port.fire({ type: 'start', title: 'T', url: 'https://x', summary: SUMMARY });
    await waitFor(() => port.posted.some((m) => m.type === 'turn-done'));

    const types = port.posted.map((m) => m.type);
    expect(types).toContain('turn-started');
    expect(types).toContain('turn-done');
    const done = port.posted.find((m) => m.type === 'turn-done');
    expect(done.data.message).toBe(OPENING_TURN.message);
    // shuffle preserves the set
    expect([...done.data.suggestedReplies].sort()).toEqual(
      [...OPENING_TURN.suggestedReplies].sort(),
    );
  });

  it('honors skipOpeningTurn — posts context-ready and does not fetch', async () => {
    await configureSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);

    port.fire({
      type: 'start',
      title: 'T',
      url: 'https://x',
      summary: SUMMARY,
      skipOpeningTurn: true,
    });
    await waitFor(() => port.posted.some((m) => m.type === 'context-ready'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(port.posted.some((m) => m.type === 'turn-started')).toBe(false);
  });

  it('streams a subsequent turn when a turn message is sent', async () => {
    await configureSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);

    const turns = [OPENING_TURN, SECOND_TURN];
    let call = 0;
    globalThis.fetch.mockImplementation(() => {
      const turn = turns[call++] ?? turns[turns.length - 1];
      return Promise.resolve(
        sseResponse([delta(JSON.stringify(turn)), 'data: [DONE]\n\n']),
      );
    });

    port.fire({ type: 'start', title: 'T', url: 'https://x', summary: SUMMARY });
    await waitFor(() => port.posted.filter((m) => m.type === 'turn-done').length === 1);

    port.fire({
      type: 'turn',
      history: [
        { role: 'assistant', content: OPENING_TURN.message },
        { role: 'user', content: 'I disagree because…' },
      ],
    });
    await waitFor(() => port.posted.filter((m) => m.type === 'turn-done').length === 2);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const dones = port.posted.filter((m) => m.type === 'turn-done');
    expect(dones[1].data.message).toBe(SECOND_TURN.message);
  });

  it('emits NO_CONTEXT when a turn arrives before start', async () => {
    await configureSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);

    port.fire({ type: 'turn', history: [{ role: 'user', content: 'hi' }] });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    expect(port.posted.find((m) => m.type === 'error').code).toBe('NO_CONTEXT');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not write to either cache kind', async () => {
    await configureSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse([delta(JSON.stringify(OPENING_TURN)), 'data: [DONE]\n\n']),
    );

    port.fire({ type: 'start', title: 'T', url: 'https://x', summary: SUMMARY });
    await waitFor(() => port.posted.some((m) => m.type === 'turn-done'));

    const settings = {
      providerMode: 'custom',
      providerId: 'openrouter',
      apiKey: 'sk-test',
      model: 'openai/gpt-4.1-mini',
      preferredLanguage: 'English',
    };
    const hash = await contentHash('T', '', providerFingerprint(settings), PROMPT_VERSION);
    const all = await chrome.storage.local.get(null);
    expect(all[`depth:cache:1-3:${hash}`]).toBeUndefined();
    expect(all[`depth:cache:quiz:${hash}`]).toBeUndefined();
    const cacheKeys = Object.keys(all).filter((k) => k.startsWith('depth:cache:'));
    expect(cacheKeys).toEqual([]);
  });

  it('emits NO_API_KEY when generation is not configured', async () => {
    await importWorker();
    const port = makePort();
    await fireConnect(port);
    port.fire({ type: 'start', title: 'T', url: 'https://x', summary: SUMMARY });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    expect(port.posted.find((m) => m.type === 'error').code).toBe('NO_API_KEY');
  });

  it('emits NO_PROVIDER_CONSENT when the fingerprint does not match', async () => {
    await configureSettings({ consented: false });
    await importWorker();
    const port = makePort();
    await fireConnect(port);
    port.fire({ type: 'start', title: 'T', url: 'https://x', summary: SUMMARY });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    expect(port.posted.find((m) => m.type === 'error').code).toBe('NO_PROVIDER_CONSENT');
  });

  it('emits API_ERROR when the provider returns a non-OK response', async () => {
    await configureSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);
    globalThis.fetch.mockResolvedValue(
      new Response('forbidden', { status: 403, statusText: 'Forbidden' }),
    );
    port.fire({ type: 'start', title: 'T', url: 'https://x', summary: SUMMARY });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    const err = port.posted.find((m) => m.type === 'error');
    expect(err.code).toBe('API_ERROR');
    expect(err.message).toMatch(/model provider/i);
  });
});
