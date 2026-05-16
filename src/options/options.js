import { getSettings, setSettings, PROVIDERS, providerFingerprint } from '../lib/settings.js';

const providerSelect = document.getElementById('providerId');
const apiKeyInput = document.getElementById('apiKey');
const modelInput = document.getElementById('model');
const form = document.getElementById('settings-form');
const savedFlag = document.getElementById('saved-flag');

for (const provider of Object.values(PROVIDERS)) {
  const option = document.createElement('option');
  option.value = provider.id;
  option.textContent = provider.label;
  providerSelect.append(option);
}

(async function init() {
  const settings = await getSettings();
  providerSelect.value = settings.providerId;
  apiKeyInput.value = settings.apiKey;
  modelInput.value = settings.model;
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = await getSettings();
  const next = {
    ...current,
    providerMode: 'custom',
    providerId: providerSelect.value,
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
  };
  const providerChanged = providerFingerprint(current) !== providerFingerprint(next);
  await setSettings({
    providerMode: 'custom',
    providerId: next.providerId,
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
    ...(providerChanged ? { consented: false, consentedProviderFingerprint: '' } : {}),
  });
  savedFlag.hidden = false;
  setTimeout(() => {
    savedFlag.hidden = true;
  }, 1800);
});
