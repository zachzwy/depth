// Coverage for each provider's fetchModels function + the shared helpers
// (dedupeSort, fetchOpenAiCompatibleModels). Branches that matter:
// network ok vs not-ok, empty data vs populated, filter predicates.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROVIDERS } from '../../src/lib/settings.js';

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openrouter.fetchModels', () => {
  it('returns deduped + sorted list from response', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 'z/model', name: 'Z' },
          { id: 'a/model', name: 'A' },
          { id: 'a/model', name: 'A duplicate' }, // dropped by dedupe
        ],
      }),
    );
    const out = await PROVIDERS.openrouter.fetchModels({});
    expect(out.map((m) => m.id)).toEqual(['a/model', 'z/model']);
  });

  it('falls back to id when name is absent', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ data: [{ id: 'x/y' }] }));
    const out = await PROVIDERS.openrouter.fetchModels({});
    expect(out[0].label).toBe('x/y');
  });

  it('throws on non-2xx', async () => {
    globalThis.fetch.mockResolvedValueOnce(new Response('nope', { status: 503 }));
    await expect(PROVIDERS.openrouter.fetchModels({})).rejects.toThrow(/503/);
  });

  it('tolerates missing `data` field', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({}));
    const out = await PROVIDERS.openrouter.fetchModels({});
    expect(out).toEqual([]);
  });
});

describe('openai.fetchModels', () => {
  it('filters out non-chat models', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 'gpt-4o-mini' },
          { id: 'gpt-3.5-turbo' },
          { id: 'text-embedding-3-small' },
          { id: 'dall-e-3' },
          { id: 'o1-mini' },
          { id: 'chatgpt-4o' },
        ],
      }),
    );
    const out = await PROVIDERS.openai.fetchModels({ apiKey: 'sk' });
    const ids = out.map((m) => m.id);
    expect(ids).toContain('gpt-4o-mini');
    expect(ids).toContain('gpt-3.5-turbo');
    expect(ids).toContain('o1-mini');
    expect(ids).toContain('chatgpt-4o');
    expect(ids).not.toContain('text-embedding-3-small');
    expect(ids).not.toContain('dall-e-3');
  });

  it('forwards the api key as a Bearer token', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ data: [{ id: 'gpt-x' }] }));
    await PROVIDERS.openai.fetchModels({ apiKey: 'sk-test' });
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.authorization).toBe('Bearer sk-test');
  });
});

describe('anthropic.fetchModels', () => {
  it('uses x-api-key and anthropic-version headers', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' },
        ],
      }),
    );
    await PROVIDERS.anthropic.fetchModels({ apiKey: 'k' });
    const init = globalThis.fetch.mock.calls[0][1];
    expect(init.headers['x-api-key']).toBe('k');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('prefers display_name and falls back to id', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 'claude-x', display_name: 'Claude X' },
          { id: 'claude-y' },
        ],
      }),
    );
    const out = await PROVIDERS.anthropic.fetchModels({ apiKey: 'k' });
    const map = new Map(out.map((m) => [m.id, m.label]));
    expect(map.get('claude-x')).toBe('Claude X');
    expect(map.get('claude-y')).toBe('claude-y');
  });

  it('throws on non-2xx', async () => {
    globalThis.fetch.mockResolvedValueOnce(new Response('bad', { status: 401 }));
    await expect(PROVIDERS.anthropic.fetchModels({ apiKey: 'k' })).rejects.toThrow(/401/);
  });
});

describe('gemini.fetchModels', () => {
  it('filters to gemini/ models and strips the models/ prefix', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({
        models: [
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
          { name: 'models/embedding-001' },
          { name: 'models/gemini-1.5-pro' },
        ],
      }),
    );
    const out = await PROVIDERS.gemini.fetchModels({ apiKey: 'k' });
    const ids = out.map((m) => m.id).sort();
    expect(ids).toEqual(['gemini-1.5-pro', 'gemini-2.5-flash']);
  });

  it('encodes the api key into the query string', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ models: [] }));
    await PROVIDERS.gemini.fetchModels({ apiKey: 'k/with+special' });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('key=k%2Fwith%2Bspecial');
  });

  it('throws on non-2xx', async () => {
    globalThis.fetch.mockResolvedValueOnce(new Response('bad', { status: 400 }));
    await expect(PROVIDERS.gemini.fetchModels({ apiKey: 'k' })).rejects.toThrow(/400/);
  });

  it('tolerates missing models field', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({}));
    const out = await PROVIDERS.gemini.fetchModels({ apiKey: 'k' });
    expect(out).toEqual([]);
  });

  it('falls back to name when displayName absent', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ models: [{ name: 'models/gemini-x' }] }),
    );
    const out = await PROVIDERS.gemini.fetchModels({ apiKey: 'k' });
    expect(out[0].label).toBe('models/gemini-x');
  });
});

describe('openai-compatible providers (deepseek, qwen, groq, mistral, xai)', () => {
  for (const id of ['deepseek', 'qwen', 'groq', 'mistral', 'xai']) {
    it(`${id}.fetchModels: returns deduped sorted list from OpenAI-compat /v1/models`, async () => {
      globalThis.fetch.mockResolvedValueOnce(
        jsonResponse({
          data: [
            { id: 'b-model', name: 'B' },
            { id: 'a-model' },
          ],
        }),
      );
      const out = await PROVIDERS[id].fetchModels({ apiKey: 'k' });
      expect(out.map((m) => m.id)).toEqual(['a-model', 'b-model']);
      // Bearer auth.
      const init = globalThis.fetch.mock.calls[0][1];
      expect(init.headers.authorization).toBe('Bearer k');
    });

    it(`${id}.fetchModels: throws on non-2xx`, async () => {
      globalThis.fetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
      await expect(PROVIDERS[id].fetchModels({ apiKey: 'k' })).rejects.toThrow(/500/);
    });
  }
});

describe('ollama.fetchModels (no api key)', () => {
  it('hits localhost without an auth header', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ data: [{ id: 'llama3.2' }] }));
    const out = await PROVIDERS.ollama.fetchModels({});
    expect(out[0].id).toBe('llama3.2');
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/models');
    expect(init.headers.authorization).toBeUndefined();
  });
});
