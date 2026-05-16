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
