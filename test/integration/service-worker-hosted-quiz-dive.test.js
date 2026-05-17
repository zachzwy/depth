// handleQuiz and handleDive hosted-mode routing. Mirrors the pattern in
// service-worker-hosted.test.js for handleGenerate.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setSettings, providerFingerprint } from '../../src/lib/settings.js';

function makePort(name) {
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

const OPENING = {
  message: 'Why does X matter?',
  suggestedReplies: ['agree', 'doubt', 'apply'],
};

const FOLLOW_UP = {
  message: 'And what would change your mind?',
  suggestedReplies: ['data', 'authority', 'counter'],
};

async function configureHosted({ consented = true } = {}) {
  const next = {
    providerMode: 'hosted',
    hostedBaseUrl: 'http://localhost:54321/functions/v1',
    preferredLanguage: 'English',
  };
  await setSettings({
    ...next,
    consented,
    consentedProviderFingerprint: consented ? providerFingerprint(next) : '',
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

describe('service-worker handleQuiz in hosted mode', () => {
  it('POSTs to /v1/quiz with the quiz body and forwards done', async () => {
    await configureHosted();
    await importWorker();
    const port = makePort('depth-quiz');
    await fireConnect(port);

    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(
        frame('started', { requestId: 'r1', cacheKey: 'c1' }) +
          frame('partial', { questions: [QUIZ_DOC.questions[0]] }) +
          frame('done', QUIZ_DOC),
      ),
    );

    port.fire({
      type: 'start',
      title: 'T',
      url: 'https://x',
      text: 'body',
      keyTerms: [{ label: 'k', definition: 'd' }],
    });
    await waitFor(() => port.posted.some((m) => m.type === 'done'));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:54321/functions/v1/quiz',
      expect.objectContaining({ method: 'POST' }),
    );
    const reqBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(reqBody.keyTerms).toEqual([{ label: 'k', definition: 'd' }]);
    expect(reqBody.preferredLanguage).toBe('English');
    const done = port.posted.find((m) => m.type === 'done');
    expect(done.data).toEqual(QUIZ_DOC);
  });

  it('LIMIT_REACHED bubbles through with upgradeUrl', async () => {
    await configureHosted();
    await importWorker();
    const port = makePort('depth-quiz');
    await fireConnect(port);

    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(
        frame('started', { requestId: 'r1' }) +
          frame('error', {
            code: 'LIMIT_REACHED',
            message: 'Daily free quota reached.',
            upgradeUrl: 'https://depth.app/upgrade',
          }),
      ),
    );

    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body', keyTerms: [] });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    const err = port.posted.find((m) => m.type === 'error');
    expect(err.code).toBe('LIMIT_REACHED');
    expect(err.upgradeUrl).toBe('https://depth.app/upgrade');
  });

  it('cached quiz short-circuits and never fetches', async () => {
    await configureHosted();
    await importWorker();

    let port = makePort('depth-quiz');
    await fireConnect(port);
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(frame('started', { requestId: 'r1' }) + frame('done', QUIZ_DOC)),
    );
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body', keyTerms: [] });
    await waitFor(() => port.posted.some((m) => m.type === 'done'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    port = makePort('depth-quiz');
    await fireConnect(port);
    port.fire({ type: 'start', title: 'T', url: 'https://x', text: 'body', keyTerms: [] });
    await waitFor(() => port.posted.some((m) => m.type === 'done'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(port.posted.find((m) => m.type === 'done').fromCache).toBe(true);
  });
});

describe('service-worker handleDive in hosted mode', () => {
  const SUMMARY = {
    glance: { sentence: 'central claim', confidence: 'high', evidence: '' },
    summary: { bullets: ['b1', 'b2'] },
    read: { sections: [] },
    keyTerms: [],
  };

  it('opens with empty messages and posts turn-done', async () => {
    await configureHosted();
    await importWorker();
    const port = makePort('depth-dive');
    await fireConnect(port);

    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(frame('started', { requestId: 'r1' }) + frame('done', OPENING)),
    );

    port.fire({ type: 'start', title: 'T', url: 'https://x', summary: SUMMARY });
    await waitFor(() => port.posted.some((m) => m.type === 'turn-done'));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:54321/functions/v1/dive',
      expect.objectContaining({ method: 'POST' }),
    );
    const reqBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(reqBody.messages).toEqual([]);
    expect(reqBody.title).toBe('T');
    const done = port.posted.find((m) => m.type === 'turn-done');
    expect(done.data.message).toBe(OPENING.message);
    expect([...done.data.suggestedReplies].sort()).toEqual(
      [...OPENING.suggestedReplies].sort(),
    );
  });

  it('honors skipOpeningTurn without calling fetch', async () => {
    await configureHosted();
    await importWorker();
    const port = makePort('depth-dive');
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
  });

  it('sends full history on subsequent turns', async () => {
    await configureHosted();
    await importWorker();
    const port = makePort('depth-dive');
    await fireConnect(port);

    const turns = [OPENING, FOLLOW_UP];
    let i = 0;
    globalThis.fetch.mockImplementation(() => {
      const turn = turns[i++] ?? FOLLOW_UP;
      return Promise.resolve(
        sseResponse(frame('started', { requestId: 'r' + i }) + frame('done', turn)),
      );
    });

    port.fire({ type: 'start', title: 'T', url: 'https://x', summary: SUMMARY });
    await waitFor(() => port.posted.filter((m) => m.type === 'turn-done').length === 1);

    port.fire({
      type: 'turn',
      history: [
        { role: 'assistant', content: OPENING.message },
        { role: 'user', content: 'I disagree because…' },
      ],
    });
    await waitFor(() => port.posted.filter((m) => m.type === 'turn-done').length === 2);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(secondBody.messages).toEqual([
      { role: 'assistant', content: OPENING.message },
      { role: 'user', content: 'I disagree because…' },
    ]);
    expect(port.posted.filter((m) => m.type === 'turn-done')[1].data.message).toBe(
      FOLLOW_UP.message,
    );
  });

  it('hosted dive never writes to the cache', async () => {
    await configureHosted();
    await importWorker();
    const port = makePort('depth-dive');
    await fireConnect(port);
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(frame('started', { requestId: 'r1' }) + frame('done', OPENING)),
    );

    port.fire({ type: 'start', title: 'T', url: 'https://x', summary: SUMMARY });
    await waitFor(() => port.posted.some((m) => m.type === 'turn-done'));

    const all = await chrome.storage.local.get(null);
    const cacheKeys = Object.keys(all).filter((k) => k.startsWith('depth:cache:'));
    expect(cacheKeys).toEqual([]);
  });

  it('hosted dive LIMIT_REACHED on opening surfaces with upgradeUrl', async () => {
    await configureHosted();
    await importWorker();
    const port = makePort('depth-dive');
    await fireConnect(port);
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(
        frame('started', { requestId: 'r1' }) +
          frame('error', {
            code: 'LIMIT_REACHED',
            message: 'Daily free quota reached.',
            upgradeUrl: 'https://depth.app/upgrade',
          }),
      ),
    );

    port.fire({ type: 'start', title: 'T', url: 'https://x', summary: SUMMARY });
    await waitFor(() => port.posted.some((m) => m.type === 'error'));
    const err = port.posted.find((m) => m.type === 'error');
    expect(err.code).toBe('LIMIT_REACHED');
    expect(err.upgradeUrl).toBe('https://depth.app/upgrade');
  });
});
