import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getCached, setCached, clearCached } from '../../src/background/cache.js';
import { getSession, saveSession, clearSession } from '../../src/lib/session.js';
import { getDeck, addToDeck } from '../../src/lib/deck.js';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe('cache', () => {
  it('round-trips by hash + kind', async () => {
    await setCached('h1', { glance: { sentence: 'hi' } }, '1-3');
    const got = await getCached('h1', '1-3');
    expect(got).toEqual({ glance: { sentence: 'hi' } });
  });

  it('isolates kinds', async () => {
    await setCached('h1', { kind: 'a' }, '1-3');
    await setCached('h1', { kind: 'b' }, 'quiz');
    expect(await getCached('h1', '1-3')).toEqual({ kind: 'a' });
    expect(await getCached('h1', 'quiz')).toEqual({ kind: 'b' });
  });

  it('returns null on miss', async () => {
    expect(await getCached('absent', '1-3')).toBeNull();
  });

  it('clearCached removes only the targeted entry', async () => {
    await setCached('h1', { a: 1 }, '1-3');
    await setCached('h1', { b: 2 }, 'quiz');
    await clearCached('h1', '1-3');
    expect(await getCached('h1', '1-3')).toBeNull();
    expect(await getCached('h1', 'quiz')).toEqual({ b: 2 });
  });

  it('evicts after TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16'));
    await setCached('h1', { a: 1 }, '1-3');
    vi.setSystemTime(new Date('2026-06-16')); // > 7 days later
    expect(await getCached('h1', '1-3')).toBeNull();
    vi.useRealTimers();
  });
});

describe('session', () => {
  it('round-trips state per URL', async () => {
    await saveSession('https://x/a', { level: 3, quizIndex: 2 });
    expect(await getSession('https://x/a')).toEqual({ level: 3, quizIndex: 2 });
    expect(await getSession('https://x/b')).toBeNull();
  });

  it('clearSession wipes a URL', async () => {
    await saveSession('https://x/a', { level: 1 });
    await clearSession('https://x/a');
    expect(await getSession('https://x/a')).toBeNull();
  });

  it('evicts after TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T00:00:00Z'));
    await saveSession('https://x/a', { level: 1 });
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z')); // > 24h
    expect(await getSession('https://x/a')).toBeNull();
    vi.useRealTimers();
  });

  it('refuses to operate on a falsy URL', async () => {
    await saveSession('', { level: 1 });
    expect(await getSession('')).toBeNull();
  });
});

describe('deck', () => {
  it('starts empty', async () => {
    expect(await getDeck()).toEqual([]);
  });

  it('appends entries with id and savedAt', async () => {
    const entry = await addToDeck({ type: 'quote', front: 'F', back: 'B' });
    expect(entry.id).toBeTruthy();
    expect(typeof entry.savedAt).toBe('number');
    const deck = await getDeck();
    expect(deck).toHaveLength(1);
    expect(deck[0]).toEqual(entry);
  });

  it('preserves insertion order across saves', async () => {
    await addToDeck({ type: 'quote', front: 'one' });
    await addToDeck({ type: 'quote', front: 'two' });
    const deck = await getDeck();
    expect(deck.map((d) => d.front)).toEqual(['one', 'two']);
  });
});
