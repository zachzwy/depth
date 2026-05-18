import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setSettings, providerFingerprint, PROVIDERS } from '../../src/lib/settings.js';
import { contentHash } from '../../src/lib/content-hash.js';
import { PROMPT_VERSION } from '../../src/lib/prompts.js';

function makePort(name = 'depth-quiz') {
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
  // handleQuiz bound to the freshly-imported module.
  globalThis.chrome._connectListeners.clear();
  globalThis.chrome._messageListeners.clear();
  vi.resetModules();
  return import('../../src/background/service-worker.js');
}

async function fireConnect(port) {
  const listeners = [...globalThis.chrome._connectListeners];
  for (const fn of listeners) fn(port);
}

const QUIZ_DOC = {
  questions: [
    {
      prompt: 'Q1',
      choices: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      explanation: 'because',
      commonWrongIndex: 1,
      commonWrongWhy: 'tempting',
    },
  ],
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

describe('service-worker handleQuiz', () => {
  it('streams partial JSON and posts done on completion', async () => {
    await configureSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);

    globalThis.fetch.mockResolvedValueOnce(
      sseResponse([
        delta(JSON.stringify(QUIZ_DOC).slice(0, 25)),
        delta(JSON.stringify(QUIZ_DOC).slice(25)),
        'data: [DONE]\n\n',
      ]),
    );

    port.fire({
      type: 'start',
      title: 'T',
      url: 'https://x',
      text: 'body',
      keyTerms: [{ label: 'k', definition: 'd' }],
    });
    await waitFor(() => port.posted.some((m) => m.type === 'done'));

    const types = port.posted.map((m) => m.type);
    expect(types).toContain('started');
    expect(types).toContain('done');
    const done = port.posted.find((m) => m.type === 'done');
    expect(done.data).toEqual(QUIZ_DOC);
    expect(done.fromCache).toBeUndefined();
  });

  it('returns the cached quiz and skips streaming on a cache hit', async () => {
    await configureSettings();
    await importWorker();

    let port = makePort();
    await fireConnect(port);
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse([delta(JSON.stringify(QUIZ_DOC)), 'data: [DONE]\n\n']),
    );
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body', keyTerms: [] });
    await waitFor(() => port.posted.some((m) => m.type === 'done'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    port = makePort();
    await fireConnect(port);
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body', keyTerms: [] });
    await waitFor(() => port.posted.some((m) => m.type === 'done'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const done = port.posted.find((m) => m.type === 'done');
    expect(done.fromCache).toBe(true);
    expect(done.data).toEqual(QUIZ_DOC);
  });

  it('writes to the quiz cache kind independently of the 1-3 cache', async () => {
    await configureSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse([delta(JSON.stringify(QUIZ_DOC)), 'data: [DONE]\n\n']),
    );
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body', keyTerms: [] });
    await waitFor(() => port.posted.some((m) => m.type === 'done'));

    const settings = {
      providerMode: 'custom',
      providerId: 'openrouter',
      apiKey: 'sk-test',
      model: 'openai/gpt-4.1-mini',
      preferredLanguage: 'English',
    };
    const hash = await contentHash('T', 'body', providerFingerprint(settings), PROMPT_VERSION);
    const all = await chrome.storage.local.get(null);
    expect(all[`depth:cache:quiz:${hash}`]).toBeTruthy();
    expect(all[`depth:cache:1-3:${hash}`]).toBeUndefined();
  });

  it('emits NO_API_KEY when generation is not configured', async () => {
    await chrome.storage.local.set({ providerMode: 'custom' });
    await importWorker();
    const port = makePort();
    await fireConnect(port);
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body', keyTerms: [] });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    const err = port.posted.find((m) => m.type === 'error');
    expect(err.code).toBe('NO_API_KEY');
  });

  it('emits NO_PROVIDER_CONSENT when the fingerprint does not match', async () => {
    await configureSettings({ consented: false });
    await importWorker();
    const port = makePort();
    await fireConnect(port);
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body', keyTerms: [] });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    const err = port.posted.find((m) => m.type === 'error');
    expect(err.code).toBe('NO_PROVIDER_CONSENT');
  });

  it('emits API_ERROR when the provider returns a non-OK response', async () => {
    await configureSettings();
    await importWorker();
    const port = makePort();
    await fireConnect(port);
    globalThis.fetch.mockResolvedValue(
      new Response('forbidden', { status: 403, statusText: 'Forbidden' }),
    );
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body', keyTerms: [] });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    const err = port.posted.find((m) => m.type === 'error');
    expect(err.code).toBe('API_ERROR');
    expect(err.message).toMatch(/model provider/i);
  });
});
