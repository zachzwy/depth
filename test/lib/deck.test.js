import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDeck,
  addToDeck,
  removeFromDeckByUrl,
  removeFromDeckById,
  updateInDeck,
} from '../../src/lib/deck.js';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe('deck CRUD', () => {
  it('getDeck returns [] when storage is empty', async () => {
    expect(await getDeck()).toEqual([]);
  });

  it('addToDeck assigns id + savedAt and pushes onto storage', async () => {
    const entry = await addToDeck({ type: 'quote', front: 'F', back: 'B' });
    expect(entry.id).toBeTruthy();
    expect(typeof entry.savedAt).toBe('number');
    expect(await getDeck()).toEqual([entry]);
  });

  it('removeFromDeckByUrl filters by source.url', async () => {
    await addToDeck({ type: 'quote', front: 'a', source: { url: 'https://x.test' } });
    await addToDeck({ type: 'quote', front: 'b', source: { url: 'https://y.test' } });
    const after = await removeFromDeckByUrl('https://x.test');
    expect(after).toHaveLength(1);
    expect(after[0].front).toBe('b');
    // Persisted, not just returned.
    expect(await getDeck()).toEqual(after);
  });

  it('removeFromDeckByUrl tolerates entries with no source', async () => {
    const a = await addToDeck({ type: 'quote', front: 'no-source' });
    const after = await removeFromDeckByUrl('https://anywhere.test');
    expect(after).toEqual([a]);
  });

  it('removeFromDeckById removes by id, leaves the rest', async () => {
    const a = await addToDeck({ type: 'quote', front: 'a' });
    const b = await addToDeck({ type: 'quote', front: 'b' });
    const after = await removeFromDeckById(a.id);
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(b);
  });

  it('removeFromDeckById on unknown id is a no-op', async () => {
    const a = await addToDeck({ type: 'quote', front: 'a' });
    const after = await removeFromDeckById('not-a-real-id');
    expect(after).toEqual([a]);
  });

  it('updateInDeck applies updater function only to the matched card', async () => {
    const a = await addToDeck({ type: 'quote', front: 'a' });
    const b = await addToDeck({ type: 'quote', front: 'b' });
    const after = await updateInDeck(a.id, (card) => ({ ...card, front: 'A!' }));
    expect(after.find((c) => c.id === a.id).front).toBe('A!');
    expect(after.find((c) => c.id === b.id).front).toBe('b');
  });

  it('updateInDeck with unknown id leaves the deck unchanged', async () => {
    const a = await addToDeck({ type: 'quote', front: 'a' });
    const after = await updateInDeck('nope', () => ({ id: 'nope', front: 'X' }));
    expect(after).toEqual([a]);
  });
});
