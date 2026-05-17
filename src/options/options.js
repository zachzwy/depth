import {
  getSettings,
  setSettings,
  PROVIDERS,
  providerFingerprint,
  hasProviderPermission,
  requestProviderPermission,
} from '../lib/settings.js';

const providerSelect = document.getElementById('providerId');
const apiKeyInput = document.getElementById('apiKey');
const apiKeyHint = document.getElementById('apiKey-hint');
const modelInput = document.getElementById('model');
const modelList = document.getElementById('model-list');
const modelHint = document.getElementById('model-hint');
const grantBlock = document.getElementById('grant-block');
const grantBtn = document.getElementById('grant-btn');
const grantHint = document.getElementById('grant-hint');
const preferredLanguageInput = document.getElementById('preferredLanguage');
const form = document.getElementById('settings-form');
const savedFlag = document.getElementById('saved-flag');
const saveError = document.getElementById('save-error');

for (const provider of Object.values(PROVIDERS)) {
  const option = document.createElement('option');
  option.value = provider.id;
  option.textContent = provider.label;
  providerSelect.append(option);
}

function currentProvider() {
  return PROVIDERS[providerSelect.value] ?? null;
}

function displayHost(hostPermission) {
  if (!hostPermission) return '';
  try {
    return new URL(hostPermission.replace(/\/\*$/, '')).host;
  } catch {
    return hostPermission;
  }
}

function showGrantBlock(provider) {
  const host = displayHost(provider.hostPermission);
  const why =
    provider.requiresApiKey === false
      ? `This lets Depth send requests to your local ${provider.label} instance — nothing else.`
      : 'This lets Depth send chat-completion requests with the API key you provide — nothing else on that host.';
  grantHint.textContent = `Chrome will ask to grant Depth access to ${host}. ${why}`;
  grantBtn.textContent = `Allow access to ${provider.label}`;
  grantBlock.hidden = false;
}

function hideGrantBlock() {
  grantBlock.hidden = true;
}

function toSupportedLanguage(language) {
  const normalized = (language ?? '').trim().toLowerCase();
  if (
    normalized.includes('chinese') ||
    normalized.includes('中文') ||
    normalized.includes('汉语') ||
    normalized.startsWith('zh')
  ) {
    return 'Simplified Chinese';
  }
  return 'English';
}

let modelsFetchController = null;

function applyProviderFieldHints(provider) {
  modelInput.placeholder = provider?.defaultModel ?? '';
  const apiKeyRequired = provider && provider.requiresApiKey !== false;
  if (apiKeyRequired) {
    apiKeyInput.placeholder = 'sk-...';
    apiKeyInput.disabled = false;
    apiKeyHint.textContent = "Keys are stored only in this browser's local extension storage.";
  } else {
    apiKeyInput.placeholder = '(not required)';
    apiKeyInput.disabled = false;
    apiKeyHint.textContent = 'This provider does not require an API key.';
  }
}

async function refreshModelUI() {
  modelsFetchController?.abort();
  modelList.replaceChildren();
  hideSaveError();

  const provider = currentProvider();
  if (!provider) return;

  applyProviderFieldHints(provider);

  if (!provider.fetchModels) {
    modelHint.textContent = 'Type any model ID your provider supports.';
    hideGrantBlock();
    return;
  }

  const granted = await hasProviderPermission(provider);
  if (!granted) {
    modelHint.textContent = `Allow access to ${provider.label} to load the model list.`;
    showGrantBlock(provider);
    return;
  }

  hideGrantBlock();
  await loadModels(provider);
}

async function loadModels(provider) {
  modelHint.textContent = 'Loading models…';
  modelsFetchController = new AbortController();
  try {
    const models = await provider.fetchModels({
      apiKey: apiKeyInput.value.trim(),
      signal: modelsFetchController.signal,
    });
    const frag = document.createDocumentFragment();
    for (const m of models) {
      const option = document.createElement('option');
      option.value = m.id;
      if (m.label && m.label !== m.id) option.label = m.label;
      frag.append(option);
    }
    modelList.replaceChildren(frag);
    modelHint.textContent = models.length
      ? `${models.length} models available — pick from the list or type any ID.`
      : 'Type the model ID your provider supports.';
  } catch (err) {
    if (err?.name === 'AbortError') return;
    const msg = String(err?.message ?? '');
    if (/\b(401|403)\b/.test(msg)) {
      modelHint.textContent = 'Enter your API key, then click Save to load the model list.';
    } else if (msg.includes('Failed to fetch')) {
      modelHint.textContent =
        provider.id === 'ollama'
          ? "Couldn't reach Ollama at localhost:11434. Is it running?"
          : "Couldn't load model list — type the model ID your provider supports.";
    } else {
      modelHint.textContent = "Couldn't load model list — type the model ID your provider supports.";
    }
  }
}

function showSaveError(text) {
  saveError.textContent = text;
  saveError.hidden = false;
}

function hideSaveError() {
  saveError.textContent = '';
  saveError.hidden = true;
}

providerSelect.addEventListener('change', () => {
  refreshModelUI();
});

apiKeyInput.addEventListener('change', async () => {
  const provider = currentProvider();
  if (!provider?.fetchModels) return;
  const granted = await hasProviderPermission(provider);
  if (granted) loadModels(provider);
});

grantBtn.addEventListener('click', async () => {
  const provider = currentProvider();
  if (!provider) return;
  try {
    const granted = await requestProviderPermission(provider);
    if (granted) {
      hideGrantBlock();
      await loadModels(provider);
    } else {
      modelHint.textContent = 'Permission denied. Type the model ID your provider supports.';
    }
  } catch (e) {
    modelHint.textContent = `Could not request permission: ${e.message}`;
  }
});

(async function init() {
  const settings = await getSettings();
  providerSelect.value = settings.providerId;
  apiKeyInput.value = settings.apiKey;
  modelInput.value = settings.model;
  preferredLanguageInput.value = toSupportedLanguage(settings.preferredLanguage);
  await refreshModelUI();
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideSaveError();

  const provider = currentProvider();
  if (!provider) {
    showSaveError('No provider selected.');
    return;
  }

  if (provider.hostPermission) {
    const granted = await hasProviderPermission(provider);
    if (!granted) {
      let ok = false;
      try {
        ok = await requestProviderPermission(provider);
      } catch (err) {
        showSaveError(`Could not request host permission: ${err.message}`);
        return;
      }
      if (!ok) {
        showSaveError(`Permission for ${provider.label} was not granted. Allow access to save.`);
        return;
      }
    }
  }

  const current = await getSettings();
  const next = {
    ...current,
    providerMode: 'custom',
    providerId: provider.id,
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
    preferredLanguage: toSupportedLanguage(preferredLanguageInput.value),
  };
  const consentScopeChanged = providerFingerprint(current) !== providerFingerprint(next);
  await setSettings({
    providerMode: 'custom',
    providerId: next.providerId,
    apiKey: next.apiKey,
    model: next.model,
    preferredLanguage: next.preferredLanguage,
    ...(consentScopeChanged ? { consented: false, consentedProviderFingerprint: '' } : {}),
  });
  savedFlag.hidden = false;
  setTimeout(() => {
    savedFlag.hidden = true;
  }, 1800);
});
