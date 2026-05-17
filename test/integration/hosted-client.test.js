import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { streamHosted, HostedError } from '../../src/background/hosted-client.js';

function sseResponse(text, { status = 200, statusText = 'OK' } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    statusText,
    headers: { 'content-type': 'text/event-stream' },
  });
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const SETTINGS = {
  providerMode: 'hosted',
  hostedBaseUrl: 'http://localhost:54321/functions/v1',
  preferredLanguage: 'English',
};

beforeEach(() => {
  chrome.permissions._grant('http://localhost:54321/*');
  vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streamHosted (hosted-client)', () => {
  it('parses started/partial/done frames and resolves with the final document', async () => {
    const onPartial = vi.fn();
    const onStarted = vi.fn();
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(
        frame('started', { requestId: 'r1', cacheKey: 'c1' }) +
          frame('partial', { glance: { sentence: 'a' } }) +
          frame('partial', { glance: { sentence: 'ab' } }) +
          frame('done', { glance: { sentence: 'ab' }, summary: { bullets: [] } }),
      ),
    );

    const result = await streamHosted({
      kind: 'generate',
      settings: SETTINGS,
      body: { title: 'T', url: 'https://x', text: 'hi', preferredLanguage: 'English' },
      onPartial,
      onStarted,
    });

    expect(onStarted).toHaveBeenCalledWith({ requestId: 'r1', cacheKey: 'c1' });
    expect(onPartial).toHaveBeenCalledTimes(2);
    expect(onPartial.mock.calls[1][0]).toEqual({ glance: { sentence: 'ab' } });
    expect(result.data).toEqual({ glance: { sentence: 'ab' }, summary: { bullets: [] } });
    expect(result.cacheKey).toBe('c1');
    expect(result.requestId).toBe('r1');
  });

  it('handles frames split across chunk boundaries', async () => {
    const encoder = new TextEncoder();
    const full =
      frame('started', { requestId: 'r1', cacheKey: 'c1' }) +
      frame('partial', { glance: { sentence: 'split' } }) +
      frame('done', { glance: { sentence: 'split' } });
    const splitAt = full.length - 30;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(full.slice(0, splitAt)));
        controller.enqueue(encoder.encode(full.slice(splitAt)));
        controller.close();
      },
    });
    globalThis.fetch.mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const onPartial = vi.fn();
    const result = await streamHosted({ kind: 'generate', settings: SETTINGS, body: {}, onPartial });
    expect(onPartial).toHaveBeenCalledWith({ glance: { sentence: 'split' } });
    expect(result.data.glance.sentence).toBe('split');
  });

  it('throws a HostedError with code+message+upgradeUrl on an error frame', async () => {
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

    await expect(
      streamHosted({ kind: 'generate', settings: SETTINGS, body: {} }),
    ).rejects.toMatchObject({
      name: 'HostedError',
      code: 'LIMIT_REACHED',
      message: 'Daily free quota reached.',
      upgradeUrl: 'https://depth.app/upgrade',
    });
  });

  it('throws HostedError on a non-2xx response, lifting JSON code/message', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'ABUSE_BLOCK', message: 'go away' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      streamHosted({ kind: 'generate', settings: SETTINGS, body: {} }),
    ).rejects.toMatchObject({ code: 'ABUSE_BLOCK', message: 'go away' });
  });

  it('throws if the stream ends without a done or error frame and no partials seen', async () => {
    globalThis.fetch.mockResolvedValueOnce(sseResponse(frame('started', { requestId: 'r1' })));
    await expect(
      streamHosted({ kind: 'generate', settings: SETTINGS, body: {} }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_FAILED' });
  });

  it('sends bearer token when hostedAccessToken is set', async () => {
    globalThis.fetch.mockResolvedValueOnce(sseResponse(frame('done', {})));
    await streamHosted({
      kind: 'generate',
      settings: { ...SETTINGS, hostedAccessToken: 'tok-123' },
      body: {},
    });
    const req = globalThis.fetch.mock.calls[0][1];
    expect(req.headers.authorization).toBe('Bearer tok-123');
  });

  it('refuses if host permission is not granted', async () => {
    chrome.permissions._revokeAll();
    await expect(
      streamHosted({ kind: 'generate', settings: SETTINGS, body: {} }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /Permission for localhost/ });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects unknown kinds', async () => {
    await expect(
      streamHosted({ kind: 'unknown', settings: SETTINGS, body: {} }),
    ).rejects.toThrow(/Unknown hosted kind/);
  });

  it('POSTs to the endpoint derived from kind and hostedBaseUrl', async () => {
    globalThis.fetch.mockResolvedValueOnce(sseResponse(frame('done', {})));
    await streamHosted({ kind: 'generate', settings: SETTINGS, body: { title: 'x' } });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:54321/functions/v1/generate',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
