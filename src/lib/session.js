const KEY_PREFIX = 'depth:session:';
const TTL_MS = 24 * 60 * 60 * 1000;

export async function getSession(url) {
  if (!url) return null;
  const key = KEY_PREFIX + url;
  const { [key]: entry } = await chrome.storage.local.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > TTL_MS) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return entry.state;
}

export async function saveSession(url, state) {
  if (!url) return;
  const key = KEY_PREFIX + url;
  await chrome.storage.local.set({ [key]: { state, savedAt: Date.now() } });
}

export async function clearSession(url) {
  if (!url) return;
  const key = KEY_PREFIX + url;
  await chrome.storage.local.remove(key);
}
