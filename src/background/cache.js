const KEY_PREFIX = 'depth:cache:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const keyFor = (kind, hash) => `${KEY_PREFIX}${kind}:${hash}`;

export async function getCached(hash, kind = '1-3') {
  const key = keyFor(kind, hash);
  const { [key]: entry } = await chrome.storage.local.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > TTL_MS) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return entry.data;
}

export async function setCached(hash, data, kind = '1-3') {
  const key = keyFor(kind, hash);
  await chrome.storage.local.set({ [key]: { data, savedAt: Date.now() } });
}

export async function clearCached(hash, kind = '1-3') {
  const key = keyFor(kind, hash);
  await chrome.storage.local.remove(key);
}
