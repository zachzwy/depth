export const DEFAULTS = {
  apiKey: '',
  model: 'claude-sonnet-4-6',
  consented: false,
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function setSettings(patch) {
  await chrome.storage.sync.set(patch);
}

export function onSettingsChange(callback) {
  const handler = (changes, area) => {
    if (area !== 'sync') return;
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
