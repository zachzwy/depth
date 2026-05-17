import {
  getSettings,
  setSettings,
  PROVIDERS,
  providerFingerprint,
  hasProviderPermission,
  requestProviderPermission,
  DEFAULT_HOSTED_BASE_URL,
} from '../lib/settings.js';
import { LANGUAGE_OPTIONS, getLanguage } from '../lib/i18n/index.js';

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
const dirtyFlag = document.getElementById('dirty-flag');
const saveError = document.getElementById('save-error');

const modeRadios = [...document.querySelectorAll('input[name="providerMode"]')];
const hostedSection = document.getElementById('hosted-section');
const customSection = document.getElementById('custom-section');
const hostedGrantBlock = document.getElementById('hosted-grant-block');
const hostedGrantBtn = document.getElementById('hosted-grant-btn');
const hostedGrantHint = document.getElementById('hosted-grant-hint');

function currentMode() {
  const checked = modeRadios.find((r) => r.checked);
  return checked?.value ?? 'custom';
}

function hostedOriginPattern() {
  try {
    return new URL(DEFAULT_HOSTED_BASE_URL).origin + '/*';
  } catch {
    return '';
  }
}

function hostedHost() {
  try {
    return new URL(DEFAULT_HOSTED_BASE_URL).host;
  } catch {
    return DEFAULT_HOSTED_BASE_URL;
  }
}

for (const provider of Object.values(PROVIDERS)) {
  const option = document.createElement('option');
  option.value = provider.id;
  option.textContent = provider.label;
  providerSelect.append(option);
}

for (const opt of LANGUAGE_OPTIONS) {
  const option = document.createElement('option');
  option.value = opt.value;
  option.textContent = opt.display;
  preferredLanguageInput.append(option);
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
  return getLanguage(language).label;
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

let savedSnapshot = null;

function currentSnapshot() {
  return [
    currentMode(),
    providerSelect.value,
    apiKeyInput.value,
    modelInput.value,
    preferredLanguageInput.value,
  ].join('|');
}

async function refreshHostedUI() {
  const pattern = hostedOriginPattern();
  const granted = pattern
    ? await chrome.permissions.contains({ origins: [pattern] })
    : false;
  if (granted) {
    hostedGrantBlock.hidden = true;
  } else {
    hostedGrantHint.textContent = `Chrome will ask to grant Depth access to ${hostedHost()}. This lets Depth send your page text to Depth Hosted for generation.`;
    hostedGrantBtn.textContent = `Allow access to Depth Hosted`;
    hostedGrantBlock.hidden = false;
  }
}

function applyModeVisibility() {
  const mode = currentMode();
  hostedSection.hidden = mode !== 'hosted';
  customSection.hidden = mode !== 'custom';
  if (mode === 'hosted') refreshHostedUI();
}

function captureSavedSnapshot() {
  savedSnapshot = currentSnapshot();
  dirtyFlag.hidden = true;
}

function refreshDirtyFlag() {
  if (savedSnapshot == null) return;
  const dirty = currentSnapshot() !== savedSnapshot;
  dirtyFlag.hidden = !dirty;
  if (dirty) {
    savedFlag.hidden = true;
  }
}

for (const el of [providerSelect, apiKeyInput, modelInput, preferredLanguageInput]) {
  el.addEventListener('input', refreshDirtyFlag);
  el.addEventListener('change', refreshDirtyFlag);
}

for (const radio of modeRadios) {
  radio.addEventListener('change', () => {
    applyModeVisibility();
    refreshDirtyFlag();
  });
}

hostedGrantBtn.addEventListener('click', async () => {
  const pattern = hostedOriginPattern();
  if (!pattern) return;
  try {
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (granted) {
      hostedGrantBlock.hidden = true;
    } else {
      hostedGrantHint.textContent = `Permission denied. Depth Hosted needs access to ${hostedHost()} to generate.`;
    }
  } catch (e) {
    hostedGrantHint.textContent = `Could not request permission: ${e.message}`;
  }
});

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
  const mode = settings.providerMode === 'hosted' ? 'hosted' : 'custom';
  for (const r of modeRadios) r.checked = r.value === mode;
  providerSelect.value = settings.providerId;
  apiKeyInput.value = settings.apiKey;
  modelInput.value = settings.model;
  preferredLanguageInput.value = toSupportedLanguage(settings.preferredLanguage);
  applyModeVisibility();
  captureSavedSnapshot();
  await refreshModelUI();
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideSaveError();

  const mode = currentMode();
  const language = toSupportedLanguage(preferredLanguageInput.value);
  const current = await getSettings();

  if (mode === 'hosted') {
    const pattern = hostedOriginPattern();
    if (!pattern) {
      showSaveError('Invalid hosted base URL.');
      return;
    }
    let granted = await chrome.permissions.contains({ origins: [pattern] });
    if (!granted) {
      try {
        granted = await chrome.permissions.request({ origins: [pattern] });
      } catch (err) {
        showSaveError(`Could not request host permission: ${err.message}`);
        return;
      }
      if (!granted) {
        showSaveError(`Permission for ${hostedHost()} was not granted. Allow access to save.`);
        return;
      }
    }

    const next = {
      ...current,
      providerMode: 'hosted',
      hostedBaseUrl: DEFAULT_HOSTED_BASE_URL,
      preferredLanguage: language,
    };
    const consentScopeChanged = providerFingerprint(current) !== providerFingerprint(next);
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: DEFAULT_HOSTED_BASE_URL,
      preferredLanguage: language,
      ...(consentScopeChanged ? { consented: false, consentedProviderFingerprint: '' } : {}),
    });
    captureSavedSnapshot();
    savedFlag.hidden = false;
    setTimeout(() => {
      savedFlag.hidden = true;
    }, 1800);
    return;
  }

  // Custom (BYOK) mode
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

  const next = {
    ...current,
    providerMode: 'custom',
    providerId: provider.id,
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
    preferredLanguage: language,
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
  captureSavedSnapshot();
  savedFlag.hidden = false;
  setTimeout(() => {
    savedFlag.hidden = true;
  }, 1800);
});
