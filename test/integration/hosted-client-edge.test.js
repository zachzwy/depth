// Additional edge branches for hosted-client.js: missing base URL,
// invalid URL, non-JSON error body, last-partial fallback, parseFrame
// handling of frames missing data lines / starting with colon.

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

describe('streamHosted edge branches', () => {
  it('throws BAD_REQUEST when hostedBaseUrl is empty', async () => {
    await expect(
      streamHosted({ kind: 'generate', settings: { ...SETTINGS, hostedBaseUrl: '' }, body: {} }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'No hosted base URL set' });
  });

  it('throws BAD_REQUEST when hostedBaseUrl is unparseable', async () => {
    await expect(
      streamHosted({
        kind: 'generate',
        settings: { ...SETTINGS, hostedBaseUrl: 'not a url' },
        body: {},
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /Invalid hosted base URL/ });
  });

  it('non-2xx with non-JSON body falls back to default code/message', async () => {
    globalThis.fetch.mockResolvedValueOnce(new Response('plain text', { status: 503 }));
    await expect(
      streamHosted({ kind: 'generate', settings: SETTINGS, body: {} }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_FAILED', message: /503/ });
  });

  it('non-2xx with JSON body but no code/message keeps defaults', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      new Response('{"ok":true}', { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    await expect(
      streamHosted({ kind: 'generate', settings: SETTINGS, body: {} }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_FAILED' });
  });

  it('stream ends without done/error but has a partial → returns last partial', async () => {
    const frame = (e, d) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse(
        frame('started', { requestId: 'r', cacheKey: 'c' }) +
          frame('partial', { glance: { sentence: 'mid' } }),
        // no done, no error
      ),
    );
    const result = await streamHosted({ kind: 'generate', settings: SETTINGS, body: {} });
    expect(result.data).toEqual({ glance: { sentence: 'mid' } });
  });

  it('parseFrame: skips frames that start with a comment colon', async () => {
    // SSE comments are lines like `:keepalive` — should be ignored.
    const text =
      ':keepalive\n\n' +
      'event: started\ndata: {"requestId":"r"}\n\n' +
      'event: done\ndata: {"ok":true}\n\n';
    globalThis.fetch.mockResolvedValueOnce(sseResponse(text));
    const result = await streamHosted({ kind: 'generate', settings: SETTINGS, body: {} });
    expect(result.data).toEqual({ ok: true });
  });

  it('parseFrame: frames with no data line are dropped silently', async () => {
    const text =
      'event: started\ndata: {"requestId":"r"}\n\n' +
      'event: bogus\n\n' + // no data line
      'event: done\ndata: {"ok":true}\n\n';
    globalThis.fetch.mockResolvedValueOnce(sseResponse(text));
    const result = await streamHosted({ kind: 'generate', settings: SETTINGS, body: {} });
    expect(result.data).toEqual({ ok: true });
  });

  it('parseFrame: malformed JSON in data line is dropped', async () => {
    const text =
      'event: started\ndata: {"requestId":"r"}\n\n' +
      'event: partial\ndata: not-json\n\n' +
      'event: done\ndata: {"ok":true}\n\n';
    globalThis.fetch.mockResolvedValueOnce(sseResponse(text));
    const result = await streamHosted({ kind: 'generate', settings: SETTINGS, body: {} });
    expect(result.data).toEqual({ ok: true });
  });

  it('routes /quiz when kind=quiz', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse('event: done\ndata: {}\n\n'),
    );
    await streamHosted({ kind: 'quiz', settings: SETTINGS, body: {} });
    expect(globalThis.fetch.mock.calls[0][0]).toBe('http://localhost:54321/functions/v1/quiz');
  });

  it('routes /dive when kind=dive', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      sseResponse('event: done\ndata: {}\n\n'),
    );
    await streamHosted({ kind: 'dive', settings: SETTINGS, body: {} });
    expect(globalThis.fetch.mock.calls[0][0]).toBe('http://localhost:54321/functions/v1/dive');
  });

  it('HostedError defaults to UPSTREAM_FAILED when no code given', () => {
    const e = new HostedError({});
    expect(e.code).toBe('UPSTREAM_FAILED');
    expect(e.message).toBe('Hosted request failed');
  });
});
