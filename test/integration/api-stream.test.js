import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { streamMessage } from '../../src/background/api.js';
import { PROVIDERS } from '../../src/lib/settings.js';

function sseResponse(events, { status = 200, statusText = 'OK' } = {}) {
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
  return new Response(body, { status, statusText, headers: { 'content-type': 'text/event-stream' } });
}

function delta(content) {
  return { choices: [{ delta: { content } }] };
}

const baseSettings = {
  providerMode: 'custom',
  providerId: 'openrouter',
  apiKey: 'sk-test',
  model: 'openai/gpt-4.1-mini',
  preferredLanguage: 'English',
};

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
  chrome.permissions._grant(PROVIDERS.openrouter.hostPermission);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streamMessage happy path', () => {
  it('streams partial JSON and returns the full text', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse([
        delta('{"glance":{"sentence"'),
        delta(':"hi"'),
        delta('}}'),
        'data: [DONE]\n\n',
      ]),
    );

    const partials = [];
    const full = await streamMessage({
      settings: baseSettings,
      system: 'sys',
      messages: 'user',
      onPartial: (d) => partials.push(d),
    });

    expect(full).toBe('{"glance":{"sentence":"hi"}}');
    expect(partials.length).toBeGreaterThanOrEqual(1);
    expect(partials.at(-1)).toEqual({ glance: { sentence: 'hi' } });
  });

  it('sends a bearer auth header when the provider needs an API key', async () => {
    globalThis.fetch.mockResolvedValueOnce(sseResponse(['data: [DONE]\n\n']));
    await streamMessage({ settings: baseSettings, system: 's', messages: 'u' });

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers.authorization).toBe('Bearer sk-test');
  });

  it('omits auth and merges extra headers for providers that opt out', async () => {
    chrome.permissions._grant(PROVIDERS.ollama.hostPermission);
    globalThis.fetch.mockResolvedValueOnce(sseResponse(['data: [DONE]\n\n']));
    await streamMessage({
      settings: { ...baseSettings, providerId: 'ollama', apiKey: '', model: 'llama3.2' },
      system: 's',
      messages: 'u',
    });
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers.authorization).toBeUndefined();
  });

  it('merges provider-specific extraHeaders (Anthropic browser bypass)', async () => {
    chrome.permissions._grant(PROVIDERS.anthropic.hostPermission);
    globalThis.fetch.mockResolvedValueOnce(sseResponse(['data: [DONE]\n\n']));
    await streamMessage({
      settings: { ...baseSettings, providerId: 'anthropic', model: 'claude-haiku-4-5' },
      system: 's',
      messages: 'u',
    });
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });
});

describe('streamMessage preconditions', () => {
  it('throws when no provider is selected', async () => {
    await expect(
      streamMessage({ settings: { ...baseSettings, providerId: 'unknown' }, system: 's', messages: 'u' }),
    ).rejects.toThrow(/missing model provider/i);
  });

  it('throws when the model is missing', async () => {
    await expect(
      streamMessage({ settings: { ...baseSettings, model: '' }, system: 's', messages: 'u' }),
    ).rejects.toThrow(/missing model/i);
  });

  it('throws when the API key is missing for a key-required provider', async () => {
    await expect(
      streamMessage({ settings: { ...baseSettings, apiKey: '' }, system: 's', messages: 'u' }),
    ).rejects.toThrow(/missing api key/i);
  });

  it('throws a permission error when the host has not been granted', async () => {
    chrome.permissions._revokeAll();
    await expect(
      streamMessage({ settings: baseSettings, system: 's', messages: 'u' }),
    ).rejects.toThrow(/permission for openrouter\.ai not granted/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('streamMessage error responses', () => {
  it('translates non-OK responses into a user-friendly error', async () => {
    globalThis.fetch.mockResolvedValueOnce(new Response('forbidden', { status: 403, statusText: 'Forbidden' }));
    await expect(
      streamMessage({ settings: baseSettings, system: 's', messages: 'u' }),
    ).rejects.toThrow(/model provider request failed \(403/i);
  });

  it('surfaces stream error events as a sanitized error', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse([{ type: 'error', error: { message: 'internal' } }, 'data: [DONE]\n\n']),
    );
    await expect(
      streamMessage({ settings: baseSettings, system: 's', messages: 'u' }),
    ).rejects.toThrow(/model provider stream failed/i);
  });
});

describe('streamMessage retries', () => {
  it('retries on 429 and succeeds when the next response is OK', async () => {
    vi.useFakeTimers();
    globalThis.fetch
      .mockResolvedValueOnce(new Response('rate-limited', { status: 429, statusText: 'Too Many Requests' }))
      .mockResolvedValueOnce(sseResponse([delta('{}'), 'data: [DONE]\n\n']));

    const promise = streamMessage({ settings: baseSettings, system: 's', messages: 'u' });
    // Advance through the backoff timer.
    await vi.runOnlyPendingTimersAsync();
    const full = await promise;
    expect(full).toBe('{}');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
