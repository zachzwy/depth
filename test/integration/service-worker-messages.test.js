// Service-worker chrome.runtime.onMessage handlers — non-port flows.
// Covers depth:open-checkout, depth:open-options, depth:probe-quiz.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setSettings } from '../../src/lib/settings.js';
import { createStoredZip } from '../background/zip-fixtures.js';

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

describe('depth:extract-document message handler', () => {
  it('returns extracted arXiv HTML text before falling back to PDF bytes', async () => {
    const body = `
      <html>
        <head><title>Attention Is All You Need</title></head>
        <body>
          <article>
            <h1>Attention Is All You Need</h1>
            <p>${'Transformers rely on attention mechanisms instead of recurrence. '.repeat(12)}</p>
          </article>
        </body>
      </html>
    `;
    globalThis.fetch.mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { 'content-type': 'text/html' } }),
    );

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:extract-document',
      url: 'https://arxiv.org/pdf/1706.03762',
      title: '1706.03762',
    });

    expect(reply.ok).toBe(true);
    expect(reply.extracted.classification).toEqual({ kind: 'article', sourceType: 'pdf-html' });
    expect(reply.extracted.sourceLabel).toBe('ar5iv HTML');
    expect(reply.extracted.text).toContain('Transformers rely on attention mechanisms');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://ar5iv.labs.arxiv.org/html/1706.03762',
      expect.any(Object),
    );
  });

  it('returns extracted Google Docs export text', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      new Response(`${'Google Docs can provide exported plain text for Depth. '.repeat(12)}`, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:extract-document',
      url: 'https://docs.google.com/document/d/doc123/edit',
      title: 'Product Notes - Google Docs',
    });

    expect(reply.ok).toBe(true);
    expect(reply.extracted.classification).toEqual({ kind: 'article', sourceType: 'google-doc' });
    expect(reply.extracted.sourceLabel).toBe('Google Docs text');
    expect(reply.extracted.text).toContain('Google Docs can provide exported plain text');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://docs.google.com/document/d/doc123/export?format=txt',
      expect.objectContaining({
        credentials: 'include',
        headers: { accept: 'text/plain,*/*' },
      }),
    );
  });

  it('returns extracted EPUB text', async () => {
    const epub = createStoredZip({
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': `
        <container>
          <rootfiles>
            <rootfile full-path="EPUB/package.opf"/>
          </rootfiles>
        </container>
      `,
      'EPUB/package.opf': `
        <package>
          <metadata><dc:title>Readable EPUB</dc:title></metadata>
          <manifest>
            <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine><itemref idref="chapter"/></spine>
        </package>
      `,
      'EPUB/chapter.xhtml': `
        <html><body><h1>Readable EPUB</h1><p>${'EPUB extraction follows the package spine and reads XHTML text. '.repeat(12)}</p></body></html>
      `,
    });
    globalThis.fetch.mockResolvedValueOnce(
      new Response(epub, { status: 200, headers: { 'content-type': 'application/epub+zip' } }),
    );

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:extract-document',
      url: 'https://example.com/books/readable.epub',
      title: 'readable.epub',
    });

    expect(reply.ok).toBe(true);
    expect(reply.extracted.classification).toEqual({ kind: 'article', sourceType: 'epub' });
    expect(reply.extracted.sourceLabel).toBe('EPUB');
    expect(reply.extracted.text).toContain('EPUB extraction follows the package spine');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/books/readable.epub',
      expect.objectContaining({
        credentials: 'include',
        headers: { accept: 'application/epub+zip,*/*' },
      }),
    );
  });

  it('returns extracted Markdown text', async () => {
    const markdown = `
      ---
      title: Markdown Essay
      ---
      # Markdown Essay

      Depth can read [Markdown files](https://example.com) as article-heavy text.

      - ${'Markdown bullets and prose are flattened into readable paragraphs. '.repeat(8)}

      \`\`\`js
      console.log('code blocks are ignored');
      \`\`\`
    `;
    globalThis.fetch.mockResolvedValueOnce(
      new Response(markdown, { status: 200, headers: { 'content-type': 'text/markdown' } }),
    );

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:extract-document',
      url: 'https://raw.githubusercontent.com/zachzwy/depth/main/README.md',
      title: 'README.md',
    });

    expect(reply.ok).toBe(true);
    expect(reply.extracted.classification).toEqual({ kind: 'article', sourceType: 'markdown' });
    expect(reply.extracted.sourceLabel).toBe('Markdown');
    expect(reply.extracted.text).toContain('Markdown Essay');
    expect(reply.extracted.text).toContain('Depth can read Markdown files');
    expect(reply.extracted.text).not.toContain('console.log');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/zachzwy/depth/main/README.md',
      expect.objectContaining({
        credentials: 'include',
        headers: { accept: 'text/markdown,text/plain,*/*' },
      }),
    );
  });

  it('returns extracted plain text', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      new Response(`${'Plain text files can carry long essays without HTML structure. '.repeat(12)}`, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    await importWorker();
    const reply = await fireMessage({
      type: 'depth:extract-document',
      url: 'https://example.com/essay.txt',
      title: 'essay.txt',
    });

    expect(reply.ok).toBe(true);
    expect(reply.extracted.classification).toEqual({ kind: 'article', sourceType: 'raw-text' });
    expect(reply.extracted.sourceLabel).toBe('Plain text');
    expect(reply.extracted.text).toContain('Plain text files can carry long essays');
  });
});
