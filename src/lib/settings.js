function dedupeSort(models) {
  const map = new Map();
  for (const m of models) if (m.id && !map.has(m.id)) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchOpenAiCompatibleModels(url, headers, signal) {
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`);
  const json = await res.json();
  return (json.data ?? []).map((m) => ({ id: m.id, label: m.name || m.id }));
}

export const PROVIDERS = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'https://openrouter.ai/api/v1',
    hostPermission: 'https://openrouter.ai/api/v1/*',
    defaultModel: 'openai/gpt-4.1-mini',
    async fetchModels({ signal } = {}) {
      const res = await fetch('https://openrouter.ai/api/v1/models', { signal });
      if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`);
      const json = await res.json();
      return dedupeSort((json.data ?? []).map((m) => ({ id: m.id, label: m.name || m.id })));
    },
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'https://api.openai.com/v1',
    hostPermission: 'https://api.openai.com/v1/*',
    defaultModel: 'gpt-4.1-mini',
    async fetchModels({ apiKey, signal } = {}) {
      const models = await fetchOpenAiCompatibleModels(
        'https://api.openai.com/v1/models',
        { authorization: `Bearer ${apiKey}` },
        signal,
      );
      // /v1/models returns embeddings, audio, and image models too. Filter to chat.
      return dedupeSort(models.filter((m) => /^(gpt-|o\d|chatgpt-)/i.test(m.id)));
    },
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'https://api.anthropic.com/v1',
    hostPermission: 'https://api.anthropic.com/v1/*',
    defaultModel: 'claude-haiku-4-5',
    extraHeaders: { 'anthropic-dangerous-direct-browser-access': 'true' },
    async fetchModels({ apiKey, signal } = {}) {
      // Anthropic's native /v1/models uses x-api-key, not Bearer.
      const res = await fetch('https://api.anthropic.com/v1/models', {
        signal,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`);
      const json = await res.json();
      return dedupeSort(
        (json.data ?? []).map((m) => ({ id: m.id, label: m.display_name || m.id })),
      );
    },
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    hostPermission: 'https://generativelanguage.googleapis.com/v1beta/*',
    defaultModel: 'gemini-2.5-flash',
    async fetchModels({ apiKey, signal } = {}) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { signal },
      );
      if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`);
      const json = await res.json();
      return dedupeSort(
        (json.models ?? [])
          .filter((m) => m.name?.startsWith('models/gemini-'))
          .map((m) => ({
            id: m.name.replace(/^models\//, ''),
            label: m.displayName || m.name,
          })),
      );
    },
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'https://api.deepseek.com/v1',
    hostPermission: 'https://api.deepseek.com/v1/*',
    defaultModel: 'deepseek-chat',
    async fetchModels({ apiKey, signal } = {}) {
      const models = await fetchOpenAiCompatibleModels(
        'https://api.deepseek.com/v1/models',
        { authorization: `Bearer ${apiKey}` },
        signal,
      );
      return dedupeSort(models);
    },
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen (DashScope)',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    hostPermission: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/*',
    defaultModel: 'qwen-flash',
    async fetchModels({ apiKey, signal } = {}) {
      const models = await fetchOpenAiCompatibleModels(
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models',
        { authorization: `Bearer ${apiKey}` },
        signal,
      );
      return dedupeSort(models);
    },
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'https://api.groq.com/openai/v1',
    hostPermission: 'https://api.groq.com/openai/v1/*',
    defaultModel: 'llama-3.3-70b-versatile',
    async fetchModels({ apiKey, signal } = {}) {
      const models = await fetchOpenAiCompatibleModels(
        'https://api.groq.com/openai/v1/models',
        { authorization: `Bearer ${apiKey}` },
        signal,
      );
      return dedupeSort(models);
    },
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'https://api.mistral.ai/v1',
    hostPermission: 'https://api.mistral.ai/v1/*',
    defaultModel: 'mistral-small-latest',
    async fetchModels({ apiKey, signal } = {}) {
      const models = await fetchOpenAiCompatibleModels(
        'https://api.mistral.ai/v1/models',
        { authorization: `Bearer ${apiKey}` },
        signal,
      );
      return dedupeSort(models);
    },
  },
  xai: {
    id: 'xai',
    label: 'xAI (Grok)',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'https://api.x.ai/v1',
    hostPermission: 'https://api.x.ai/v1/*',
    defaultModel: 'grok-4',
    async fetchModels({ apiKey, signal } = {}) {
      const models = await fetchOpenAiCompatibleModels(
        'https://api.x.ai/v1/models',
        { authorization: `Bearer ${apiKey}` },
        signal,
      );
      return dedupeSort(models);
    },
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    apiFormat: 'openai-compatible',
    apiBaseUrl: 'http://localhost:11434/v1',
    hostPermission: 'http://localhost:11434/v1/*',
    defaultModel: 'llama3.2',
    requiresApiKey: false,
    async fetchModels({ signal } = {}) {
      const models = await fetchOpenAiCompatibleModels(
        'http://localhost:11434/v1/models',
        {},
        signal,
      );
      return dedupeSort(models);
    },
  },
};

// Default Depth Hosted endpoint. Use the linked production Supabase project
// for packaged/dev builds so OAuth opens a public auth URL instead of local
// Supabase. For local-only testing, override these values in extension storage.
export const DEFAULT_HOSTED_BASE_URL = 'https://nyducfbgsvbhyazfnysh.supabase.co/functions/v1';

// Production Supabase publishable key. Required as the `apikey` header on
// every /auth/v1 call.
export const DEFAULT_HOSTED_ANON_KEY =
  'sb_publishable_4lzg-NNYPLLjG_EgyaBBDg_zKVgFuWn';

export const DEFAULTS = {
  providerMode: 'custom',
  providerId: 'openrouter',
  apiKey: '',
  model: '',
  preferredLanguage: 'English',
  consented: false,
  consentedProviderFingerprint: '',
  hostedBaseUrl: DEFAULT_HOSTED_BASE_URL,
  hostedAnonKey: DEFAULT_HOSTED_ANON_KEY,
  // Populated lazily on first hosted call via anonymous Supabase Auth signup.
  hostedAccessToken: '',
  hostedAccessTokenExpiresAt: 0,
  hostedSubjectId: '',
  // Phase 4 additions. hostedRefreshToken is set whenever we hold any
  // session (anonymous or permanent); ensureHostedSession prefers refresh
  // over re-signup so the same auth.users.id (and tier) survives token
  // expiry. The remaining fields are cached projections of /v1/auth/whoami
  // so options.js can render the Account section without an extra round
  // trip on every load — fetchWhoami refreshes them on demand.
  hostedRefreshToken: '',
  hostedIsAnonymous: true,
  hostedEmail: '',
  hostedTier: 'free',
  hostedSubscriptionStatus: '',
  hostedCurrentPeriodEnd: '',
};

const STORAGE_AREA = 'local';

export async function getSettings() {
  const stored = await chrome.storage[STORAGE_AREA].get(Object.keys(DEFAULTS));
  const settings = { ...DEFAULTS, ...stored };
  if (settings.preferredLanguage === 'Chinese') {
    settings.preferredLanguage = 'Simplified Chinese';
  }
  return settings;
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
  if (settings.providerMode === 'hosted') {
    // Phase 1: hosted is configured as soon as a base URL is set. Quota
    // enforcement happens server-side; the extension just needs somewhere to
    // POST to. Phase 3 will additionally require an install token.
    return Boolean(settings.hostedBaseUrl?.trim());
  }
  const provider = getProvider(settings);
  if (!provider) return false;
  if (!settings.model?.trim()) return false;
  if (provider.requiresApiKey !== false && !settings.apiKey?.trim()) return false;
  return true;
}

export function providerFingerprint(settings) {
  if (settings.providerMode === 'hosted') {
    // Stable across server-side model/prompt rotation — only language and
    // the hostedBaseUrl change the fingerprint, so users aren't re-prompted
    // for consent every time we rotate the backend model.
    return ['hosted', settings.hostedBaseUrl, normalizeLanguage(settings.preferredLanguage)]
      .filter(Boolean)
      .join('|');
  }
  const provider = getProvider(settings);
  return [
    settings.providerMode,
    provider?.id,
    provider?.apiFormat,
    provider?.apiBaseUrl,
    settings.model,
    normalizeLanguage(settings.preferredLanguage),
  ].filter(Boolean).join('|');
}

export function hasConsentedToProvider(settings) {
  return settings.consentedProviderFingerprint === providerFingerprint(settings);
}

export function getProvider(settings) {
  return PROVIDERS[settings.providerId] ?? null;
}

export function normalizeLanguage(language) {
  return (language ?? '').trim() || 'English';
}

export async function hasProviderPermission(provider) {
  if (!provider?.hostPermission) return false;
  return chrome.permissions.contains({ origins: [provider.hostPermission] });
}

export async function requestProviderPermission(provider) {
  if (!provider?.hostPermission) return false;
  return chrome.permissions.request({ origins: [provider.hostPermission] });
}
