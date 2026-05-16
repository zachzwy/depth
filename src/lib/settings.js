export const PROVIDERS = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'https://openrouter.ai/api/v1',
  },
};

export const DEFAULTS = {
  providerMode: 'custom',
  providerId: 'openrouter',
  apiKey: '',
  model: '',
  consented: false,
  consentedProviderFingerprint: '',
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
  return Boolean(getProvider(settings) && settings.apiKey?.trim() && settings.model?.trim());
}

export function providerFingerprint(settings) {
  const provider = getProvider(settings);
  return [
    settings.providerMode,
    provider?.id,
    provider?.apiFormat,
    provider?.apiBaseUrl,
    settings.model,
  ].filter(Boolean).join('|');
}

export function hasConsentedToProvider(settings) {
  return settings.consentedProviderFingerprint === providerFingerprint(settings);
}

export function getProvider(settings) {
  return PROVIDERS[settings.providerId] ?? null;
}
