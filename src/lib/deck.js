const KEY = 'depth:deck';

export async function getDeck() {
  const { [KEY]: deck = [] } = await chrome.storage.local.get(KEY);
  return deck;
}

export async function addToDeck(item) {
  const deck = await getDeck();
  const entry = {
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    ...item,
  };
  deck.push(entry);
  await chrome.storage.local.set({ [KEY]: deck });
  return entry;
}

export async function removeFromDeckByUrl(url) {
  const deck = await getDeck();
  const next = deck.filter((c) => c?.source?.url !== url);
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function removeFromDeckById(id) {
  const deck = await getDeck();
  const next = deck.filter((c) => c?.id !== id);
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function updateInDeck(id, updater) {
  const deck = await getDeck();
  const next = deck.map((c) => (c?.id === id ? updater(c) : c));
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
