import { describe, it, expect } from 'vitest';
import { contentHash } from '../../src/lib/content-hash.js';

describe('contentHash', () => {
  it('returns a deterministic SHA-1 hex string', async () => {
    const a = await contentHash('title', 'body');
    const b = await contentHash('title', 'body');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });

  it('changes when any part changes', async () => {
    const base = await contentHash('title', 'body', 'fp', 'v2');
    expect(await contentHash('title!', 'body', 'fp', 'v2')).not.toBe(base);
    expect(await contentHash('title', 'body!', 'fp', 'v2')).not.toBe(base);
    expect(await contentHash('title', 'body', 'fp!', 'v2')).not.toBe(base);
    expect(await contentHash('title', 'body', 'fp', 'v3')).not.toBe(base);
  });

  it('ignores falsy parts', async () => {
    const a = await contentHash('title', 'body');
    const b = await contentHash('title', null, 'body', undefined);
    expect(a).toBe(b);
  });
});
