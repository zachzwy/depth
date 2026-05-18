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
import { signInWithGoogle, signOut, fetchWhoami, ensureHostedSession } from '../background/hosted-auth.js';
import { openCheckout, openPortal, BillingError } from '../background/billing.js';

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

const accountCard = document.getElementById('account-card');
const accountTierBadge = document.getElementById('account-tier');
const accountSignedOut = document.getElementById('account-signed-out');
const accountSignedIn = document.getElementById('account-signed-in');
const accountEmail = document.getElementById('account-email');
const accountUsage = document.getElementById('account-usage');
const accountRenewal = document.getElementById('account-renewal');
const signinGoogleBtn = document.getElementById('signin-google-btn');
const signinError = document.getElementById('signin-error');
const redirectUrlEl = document.getElementById('redirect-url');
const copyRedirectBtn = document.getElementById('copy-redirect-btn');
const upgradeBtn = document.getElementById('upgrade-btn');
const portalBtn = document.getElementById('portal-btn');
const signoutBtn = document.getElementById('signout-btn');
const billingError = document.getElementById('billing-error');

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
  if (mode === 'hosted') {
    refreshHostedUI();
    refreshAccountUI();
  }
}

// ---- Account section ----

function setInlineError(el, text) {
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

function formatRenewal(periodEnd, status) {
  if (!periodEnd) return '';
  const d = new Date(periodEnd);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  if (status === 'canceled' || status === 'unpaid') {
    return `Access ends ${date}.`;
  }
  return `Next renewal: ${date}.`;
}

function renderAccount(settings, usageSnapshot) {
  accountCard.hidden = false;
  setInlineError(signinError, '');
  setInlineError(billingError, '');

  // The redirect URL is identity-determined, not session-determined — render
  // it whenever the card paints. chrome.identity is gated on the `identity`
  // manifest permission; if missing, we just leave the field blank.
  if (redirectUrlEl) {
    try {
      redirectUrlEl.textContent = chrome.identity?.getRedirectURL?.() ?? '';
    } catch {
      redirectUrlEl.textContent = '';
    }
  }

  const hasSession = Boolean(settings.hostedAccessToken);
  const isSignedIn = hasSession && !settings.hostedIsAnonymous;

  // Tier badge: anonymous sessions get a "Free" badge too — they have a
  // quota that the user should be able to see.
  if (hasSession) {
    const tier = settings.hostedTier === 'pro' ? 'pro' : 'free';
    accountTierBadge.hidden = false;
    accountTierBadge.textContent = tier === 'pro' ? 'Pro' : 'Free';
    accountTierBadge.dataset.tier = tier;
  } else {
    accountTierBadge.hidden = true;
  }

  // Usage counter: rendered for every active hosted session, anonymous
  // or signed-in. Lives inside the signed-out card too so anon users see
  // their remaining quota above the sign-in CTA.
  if (hasSession && usageSnapshot?.tiers) {
    const lines = [];
    for (const kind of ['generate', 'quiz', 'dive']) {
      const u = usageSnapshot.tiers[kind];
      if (u) lines.push(`${labelForKind(kind)} ${u.used}/${u.limit}`);
    }
    if (lines.length) {
      accountUsage.textContent = `Today: ${lines.join(' · ')}`;
      accountUsage.hidden = false;
    } else {
      accountUsage.hidden = true;
    }
  } else {
    accountUsage.hidden = true;
  }

  if (!isSignedIn) {
    accountSignedOut.hidden = false;
    accountSignedIn.hidden = true;
    // Move the usage line into the signed-out card so anon users see it.
    accountSignedOut.insertBefore(accountUsage, accountSignedOut.firstChild);
    return;
  }

  accountSignedOut.hidden = true;
  accountSignedIn.hidden = false;
  accountEmail.textContent = settings.hostedEmail || '(no email on file)';
  // Put usage back under "Signed in as" for permanent accounts.
  accountSignedIn.insertBefore(accountUsage, accountSignedIn.children[1]);

  const tier = settings.hostedTier === 'pro' ? 'pro' : 'free';
  upgradeBtn.hidden = tier !== 'free';
  portalBtn.hidden = tier !== 'pro';

  const renewalText = formatRenewal(settings.hostedCurrentPeriodEnd, settings.hostedSubscriptionStatus);
  if (renewalText) {
    accountRenewal.textContent = renewalText;
    accountRenewal.hidden = false;
  } else {
    accountRenewal.hidden = true;
  }
}

function labelForKind(kind) {
  if (kind === 'generate') return 'Summaries';
  if (kind === 'quiz') return 'Quizzes';
  if (kind === 'dive') return 'Dive turns';
  return kind;
}

async function fetchUsageSnapshot(settings) {
  const baseUrl = (settings.hostedBaseUrl ?? '').replace(/\/+$/, '');
  if (!baseUrl || !settings.hostedAccessToken) return null;
  try {
    const res = await fetch(`${baseUrl}/usage`, {
      headers: {
        authorization: `Bearer ${settings.hostedAccessToken}`,
        accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function refreshAccountUI({ skipWhoami = false } = {}) {
  const settings = await getSettings();

  // First paint from cached projection so the UI feels instant.
  renderAccount(settings, null);

  if (skipWhoami) return;

  // Refresh the access token before whoami/usage. Without this, an
  // expired anon token (the common case for free users coming back the
  // next day) 401s and the usage line silently disappears. The SW does
  // this on every hosted call; the options page needs it too.
  if (settings.hostedAccessToken || settings.hostedRefreshToken) {
    try {
      await ensureHostedSession(settings);
    } catch (err) {
      console.warn('[options] ensureHostedSession failed:', err?.message);
    }
  }

  // Quietly refresh tier/subscription from the server; if it errors (no
  // token, offline) the cached values stand. Usage is fetched in parallel
  // so the panel populates in one paint cycle.
  const [whoamiResult, usage] = await Promise.allSettled([
    settings.hostedAccessToken ? fetchWhoami(settings) : Promise.resolve(null),
    settings.hostedAccessToken ? fetchUsageSnapshot(settings) : Promise.resolve(null),
  ]);

  const fresh = await getSettings();
  const usageSnapshot = usage.status === 'fulfilled' ? usage.value : null;
  renderAccount(fresh, usageSnapshot);

  if (whoamiResult.status === 'rejected') {
    console.warn('[options] whoami refresh failed:', whoamiResult.reason);
  }
}

copyRedirectBtn?.addEventListener('click', async () => {
  const text = redirectUrlEl?.textContent ?? '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = copyRedirectBtn.textContent;
    copyRedirectBtn.textContent = 'Copied';
    setTimeout(() => {
      copyRedirectBtn.textContent = original;
    }, 1200);
  } catch {
    // Clipboard refused; user can long-press the code instead.
  }
});

signinGoogleBtn.addEventListener('click', async () => {
  setInlineError(signinError, '');
  signinGoogleBtn.disabled = true;
  try {
    const settings = await getSettings();
    const result = await signInWithGoogle(settings);
    await refreshAccountUI();
    if (result?.linked) {
      // Non-blocking hint that today's anon usage carried over.
      setInlineError(billingError, '');
      accountUsage.textContent = (accountUsage.textContent || '') + ' · Linked your anonymous usage history';
    }
  } catch (err) {
    setInlineError(signinError, err.message || 'Sign-in failed.');
  } finally {
    signinGoogleBtn.disabled = false;
  }
});

signoutBtn.addEventListener('click', async () => {
  setInlineError(billingError, '');
  signoutBtn.disabled = true;
  try {
    const settings = await getSettings();
    await signOut(settings);
    await refreshAccountUI({ skipWhoami: true });
  } catch (err) {
    setInlineError(billingError, err.message || 'Sign-out failed.');
  } finally {
    signoutBtn.disabled = false;
  }
});

upgradeBtn.addEventListener('click', async () => {
  setInlineError(billingError, '');
  upgradeBtn.disabled = true;
  try {
    const settings = await getSettings();
    await openCheckout(settings);
  } catch (err) {
    const msg = err instanceof BillingError ? err.message : (err.message || 'Could not start checkout.');
    setInlineError(billingError, msg);
  } finally {
    upgradeBtn.disabled = false;
  }
});

portalBtn.addEventListener('click', async () => {
  setInlineError(billingError, '');
  portalBtn.disabled = true;
  try {
    const settings = await getSettings();
    await openPortal(settings);
  } catch (err) {
    const msg = err instanceof BillingError ? err.message : (err.message || 'Could not open billing portal.');
    setInlineError(billingError, msg);
  } finally {
    portalBtn.disabled = false;
  }
});

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

// Refresh tier/usage whenever the tab regains focus (e.g. user returns
// here after completing Stripe checkout in another tab). The webhook has
// already flipped tier server-side; this just pulls the fresh whoami so
// the Pro badge shows without requiring a manual reload.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (currentMode() !== 'hosted') return;
  refreshAccountUI();
});

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
