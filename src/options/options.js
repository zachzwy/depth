import { getSettings, setSettings } from '../lib/settings.js';

const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('model');
const form = document.getElementById('settings-form');
const savedFlag = document.getElementById('saved-flag');

(async function init() {
  const settings = await getSettings();
  apiKeyInput.value = settings.apiKey;
  modelSelect.value = settings.model;
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await setSettings({
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
  });
  savedFlag.hidden = false;
  setTimeout(() => {
    savedFlag.hidden = true;
  }, 1800);
});
