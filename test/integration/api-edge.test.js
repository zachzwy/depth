// api.js coverage for the retry path, error event branch, and
// auth-header omission for Ollama (requiresApiKey=false).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamMessage } from '../../src/background/api.js';
import { setSettings, getSettings } from '../../src/lib/settings.js';

function sseResponse(text, { status = 200 } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

const frame = (d) => `data: ${JSON.stringify(d)}\n\n`;

async function configureOpenRouter() {
  await setSettings({
    providerMode: 'custom',
    providerId: 'openrouter',
    apiKey: 'sk-x',
    model: 'openai/gpt-4o-mini',
    preferredLanguage: 'English',
  });
  chrome.permissions._grant('https://openrouter.ai/api/v1/*');
  return getSettings();
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
  // Force the retry sleeps to resolve immediately so we don't wait
  // seconds during the test. setTimeout(fn, ms) is what api.js's sleep
  // uses internally.
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => {
    fn();
    return 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streamMessage retry behavior', () => {
  it('retries on 429, succeeds on the second attempt', async () => {
    const settings = await configureOpenRouter();
    globalThis.fetch
      .mockResolvedValueOnce(new Response('too many', { status: 429 }))
      .mockResolvedValueOnce(sseResponse(frame({ choices: [{ delta: { content: 'ok' } }] })));

    const onPartial = vi.fn();
    const text = await streamMessage({
      settings,
      system: 'sys',
      messages: 'hi',
      onPartial,
    });
    expect(text).toBe('ok');
    expect(globalThis.fetch.mock.calls.length).toBe(2);
  });

  it('retries on 5xx, succeeds on the third attempt', async () => {
    const settings = await configureOpenRouter();
    globalThis.fetch
      .mockResolvedValueOnce(new Response('down', { status: 502 }))
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(sseResponse(frame({ choices: [{ delta: { content: 'finally' } }] })));

    const text = await streamMessage({ settings, system: 'sys', messages: 'hi' });
    expect(text).toBe('finally');
    expect(globalThis.fetch.mock.calls.length).toBe(3);
  });

  it('eventually surfaces the last error when all attempts fail with network errors', async () => {
    const settings = await configureOpenRouter();
    globalThis.fetch.mockRejectedValue(new Error('net down'));
    await expect(
      streamMessage({ settings, system: 'sys', messages: 'hi' }),
    ).rejects.toThrow(/net down/);
  });

  it('returns immediately when the response is 200', async () => {
    const settings = await configureOpenRouter();
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(frame({ choices: [{ delta: { content: 'one-shot' } }] })),
    );
    const text = await streamMessage({ settings, system: 'sys', messages: 'hi' });
    expect(text).toBe('one-shot');
    expect(globalThis.fetch.mock.calls.length).toBe(1);
  });

  it('aborts mid-retry when the signal is aborted', async () => {
    const settings = await configureOpenRouter();
    const controller = new AbortController();
    globalThis.fetch.mockImplementation(() => {
      controller.abort();
      const e = new Error('aborted');
      e.name = 'AbortError';
      return Promise.reject(e);
    });
    await expect(
      streamMessage({ settings, system: 's', messages: 'hi', signal: controller.signal }),
    ).rejects.toThrow();
  });
});

describe('streamMessage configuration errors', () => {
  it('throws when provider id is unknown', async () => {
    await setSettings({
      providerMode: 'custom',
      providerId: 'nonsense',
      apiKey: 'sk',
      model: 'm',
    });
    const settings = await getSettings();
    await expect(streamMessage({ settings, system: 's', messages: 'hi' })).rejects.toThrow(/Missing model provider/);
  });

  it('throws when api key is missing for a provider that requires it', async () => {
    await setSettings({
      providerMode: 'custom',
      providerId: 'openrouter',
      apiKey: '',
      model: 'm',
    });
    const settings = await getSettings();
    await expect(streamMessage({ settings, system: 's', messages: 'hi' })).rejects.toThrow(/Missing API key/);
  });

  it('throws when model is missing', async () => {
    await setSettings({
      providerMode: 'custom',
      providerId: 'openrouter',
      apiKey: 'sk',
      model: '',
    });
    const settings = await getSettings();
    await expect(streamMessage({ settings, system: 's', messages: 'hi' })).rejects.toThrow(/Missing model/);
  });

  it('throws when host permission is not granted', async () => {
    await setSettings({
      providerMode: 'custom',
      providerId: 'openrouter',
      apiKey: 'sk',
      model: 'm',
    });
    const settings = await getSettings();
    chrome.permissions._revokeAll();
    await expect(streamMessage({ settings, system: 's', messages: 'hi' })).rejects.toThrow(/Permission for/);
  });

  it('throws when upstream returns non-2xx after retries exhausted', async () => {
    await setSettings({
      providerMode: 'custom',
      providerId: 'openrouter',
      apiKey: 'sk',
      model: 'm',
    });
    const settings = await getSettings();
    chrome.permissions._grant('https://openrouter.ai/api/v1/*');
    globalThis.fetch.mockResolvedValue(new Response('bad', { status: 502 }));
    await expect(streamMessage({ settings, system: 's', messages: 'hi' })).rejects.toThrow(/Model provider request failed/);
  });

  it('throws when stream contains an error event', async () => {
    const settings = await configureOpenRouter();
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(frame({ type: 'error' })),
    );
    await expect(streamMessage({ settings, system: 's', messages: 'hi' })).rejects.toThrow(/Model provider stream failed/);
  });
});

describe('streamMessage ollama path', () => {
  it('omits the authorization header when the provider does not require an api key', async () => {
    await setSettings({
      providerMode: 'custom',
      providerId: 'ollama',
      apiKey: '',
      model: 'llama3.2',
    });
    chrome.permissions._grant('http://localhost:11434/v1/*');
    const settings = await getSettings();
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(frame({ choices: [{ delta: { content: 'local' } }] })),
    );
    await streamMessage({ settings, system: 's', messages: 'hi' });
    const init = globalThis.fetch.mock.calls[0][1];
    expect(init.headers.authorization).toBeUndefined();
  });
});
