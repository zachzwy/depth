export const DEFAULTS = {
  apiKey: '',
  model: 'claude-sonnet-4-6',
  consented: false,
};

const STORAGE_AREA = 'local';

export async function getSettings() {
  const stored = await chrome.storage[STORAGE_AREA].get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function setSettings(patch) {
  await chrome.storage[STORAGE_AREA].set(patch);
}

export function onSettingsChange(callback) {
  const handler = (changes, area) => {
    if (area !== STORAGE_AREA) return;
    const relevant = {};
    let any = false;
    for (const k of Object.keys(DEFAULTS)) {
      if (changes[k]) {
        relevant[k] = changes[k].newValue;
        any = true;
      }
    }
    if (any) callback(relevant);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
