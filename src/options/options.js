import { getSettings, setSettings } from '../lib/settings.js';

const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const apiKeyInput = document.getElementById('apiKey');
const modelInput = document.getElementById('model');
const apiFormatSelect = document.getElementById('apiFormat');
const form = document.getElementById('settings-form');
const savedFlag = document.getElementById('saved-flag');

(async function init() {
  const settings = await getSettings();
  apiBaseUrlInput.value = settings.apiBaseUrl;
  apiKeyInput.value = settings.apiKey;
  modelInput.value = settings.model;
  apiFormatSelect.value = settings.apiFormat;
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await setSettings({
    providerMode: 'custom',
    apiFormat: apiFormatSelect.value,
    apiBaseUrl: apiBaseUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
  });
  savedFlag.hidden = false;
  setTimeout(() => {
    savedFlag.hidden = true;
  }, 1800);
});
