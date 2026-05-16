export const DEFAULTS = {
  providerMode: 'custom',
  apiFormat: 'openai-compatible',
  apiBaseUrl: '',
  apiKey: '',
  model: '',
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

export function isGenerationConfigured(settings) {
  if (settings.providerMode === 'hosted') return false;
  return Boolean(settings.apiBaseUrl?.trim() && settings.apiKey?.trim() && settings.model?.trim());
}

export function providerFingerprint(settings) {
  return [
    settings.providerMode,
    settings.apiFormat,
    normalizeBaseUrl(settings.apiBaseUrl),
    settings.model,
  ].filter(Boolean).join('|');
}

export function normalizeBaseUrl(url) {
  return (url ?? '').trim().replace(/\/+$/, '');
}
