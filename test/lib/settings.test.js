import { describe, it, expect, beforeEach } from 'vitest';
import {
  PROVIDERS,
  DEFAULTS,
  getSettings,
  setSettings,
  providerFingerprint,
  hasConsentedToProvider,
  isGenerationConfigured,
  getProvider,
  normalizeLanguage,
  hasProviderPermission,
  requestProviderPermission,
} from '../../src/lib/settings.js';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe('PROVIDERS registry', () => {
  it('exposes every promised provider', () => {
    const ids = Object.keys(PROVIDERS);
    for (const id of [
      'openrouter', 'openai', 'anthropic', 'gemini', 'deepseek',
      'qwen', 'groq', 'mistral', 'xai', 'ollama',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('every provider carries the required fields', () => {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      expect(p.id, `${id}.id`).toBe(id);
      expect(p.label, `${id}.label`).toBeTruthy();
      expect(p.apiFormat, `${id}.apiFormat`).toBe('openai-compatible');
      expect(p.apiBaseUrl, `${id}.apiBaseUrl`).toMatch(/^https?:\/\//);
      expect(p.hostPermission, `${id}.hostPermission`).toMatch(/^https?:\/\/.+\/\*$/);
      expect(p.defaultModel, `${id}.defaultModel`).toBeTruthy();
    }
  });

  it('Ollama is the only provider that does not require an API key', () => {
    expect(PROVIDERS.ollama.requiresApiKey).toBe(false);
    for (const id of Object.keys(PROVIDERS)) {
      if (id === 'ollama') continue;
      expect(PROVIDERS[id].requiresApiKey, id).not.toBe(false);
    }
  });
});

describe('getSettings + setSettings', () => {
  it('returns defaults for an empty store', async () => {
    const s = await getSettings();
    expect(s.providerId).toBe(DEFAULTS.providerId);
    expect(s.apiKey).toBe('');
    expect(s.model).toBe('');
  });

  it('persists and reads back patches', async () => {
    await setSettings({ apiKey: 'sk-test', model: 'openai/gpt-4.1-mini' });
    const s = await getSettings();
    expect(s.apiKey).toBe('sk-test');
    expect(s.model).toBe('openai/gpt-4.1-mini');
  });

  it("migrates legacy 'Chinese' to 'Simplified Chinese' on read", async () => {
    await chrome.storage.local.set({ preferredLanguage: 'Chinese' });
    const s = await getSettings();
    expect(s.preferredLanguage).toBe('Simplified Chinese');
  });
});

describe('isGenerationConfigured', () => {
  it('accepts the hosted defaults', () => {
    expect(isGenerationConfigured({ ...DEFAULTS })).toBe(true);
  });

  it('rejects an empty custom-mode configuration', () => {
    expect(isGenerationConfigured({ ...DEFAULTS, providerMode: 'custom' })).toBe(false);
  });

  it('accepts a configured OpenRouter user', () => {
    expect(
      isGenerationConfigured({
        ...DEFAULTS,
        providerMode: 'custom',
        providerId: 'openrouter',
        apiKey: 'sk-test',
        model: 'openai/gpt-4.1-mini',
      }),
    ).toBe(true);
  });

  it('accepts Ollama without an API key', () => {
    expect(
      isGenerationConfigured({
        ...DEFAULTS,
        providerMode: 'custom',
        providerId: 'ollama',
        apiKey: '',
        model: 'llama3.2',
      }),
    ).toBe(true);
  });

  it('accepts hosted mode when a hostedBaseUrl is set', () => {
    expect(
      isGenerationConfigured({
        ...DEFAULTS,
        providerMode: 'hosted',
        hostedBaseUrl: 'http://localhost:54321/functions/v1',
      }),
    ).toBe(true);
  });

  it('rejects hosted mode if hostedBaseUrl is blank', () => {
    expect(
      isGenerationConfigured({
        ...DEFAULTS,
        providerMode: 'hosted',
        hostedBaseUrl: '',
      }),
    ).toBe(false);
  });

  it('rejects when the model is empty', () => {
    expect(
      isGenerationConfigured({
        ...DEFAULTS,
        providerMode: 'custom',
        providerId: 'openrouter',
        apiKey: 'sk-test',
        model: '',
      }),
    ).toBe(false);
  });
});

describe('providerFingerprint', () => {
  it('changes when any participating field changes', () => {
    const base = {
      ...DEFAULTS,
      providerMode: 'custom',
      providerId: 'openrouter',
      model: 'openai/gpt-4.1-mini',
      preferredLanguage: 'English',
    };
    const baseFp = providerFingerprint(base);

    expect(providerFingerprint({ ...base, providerId: 'openai' })).not.toBe(baseFp);
    expect(providerFingerprint({ ...base, model: 'gpt-4.1' })).not.toBe(baseFp);
    expect(providerFingerprint({ ...base, preferredLanguage: 'Spanish' })).not.toBe(baseFp);
  });

  it('is stable across calls with the same input', () => {
    const s = {
      ...DEFAULTS,
      providerMode: 'custom',
      providerId: 'openrouter',
      model: 'openai/gpt-4.1-mini',
    };
    expect(providerFingerprint(s)).toBe(providerFingerprint(s));
  });
});

describe('hasConsentedToProvider', () => {
  it('returns true only when the stored fingerprint matches the live one', () => {
    const s = {
      ...DEFAULTS,
      providerMode: 'custom',
      providerId: 'openrouter',
      model: 'm',
      preferredLanguage: 'English',
    };
    expect(hasConsentedToProvider({ ...s, consentedProviderFingerprint: '' })).toBe(false);
    expect(
      hasConsentedToProvider({ ...s, consentedProviderFingerprint: providerFingerprint(s) }),
    ).toBe(true);
    expect(
      hasConsentedToProvider({
        ...s,
        model: 'changed',
        consentedProviderFingerprint: providerFingerprint(s),
      }),
    ).toBe(false);
  });
});

describe('permission helpers', () => {
  it('hasProviderPermission reflects the chrome.permissions state', async () => {
    const provider = PROVIDERS.openrouter;
    expect(await hasProviderPermission(provider)).toBe(false);
    chrome.permissions._grant(provider.hostPermission);
    expect(await hasProviderPermission(provider)).toBe(true);
  });

  it('requestProviderPermission grants the host', async () => {
    const provider = PROVIDERS.openai;
    expect(await hasProviderPermission(provider)).toBe(false);
    expect(await requestProviderPermission(provider)).toBe(true);
    expect(await hasProviderPermission(provider)).toBe(true);
  });
});

describe('getProvider', () => {
  it('looks providers up by id', () => {
    expect(getProvider({ providerId: 'openai' })).toBe(PROVIDERS.openai);
    expect(getProvider({ providerId: 'unknown' })).toBeNull();
  });
});

describe('normalizeLanguage', () => {
  it('trims and defaults to English', () => {
    expect(normalizeLanguage(undefined)).toBe('English');
    expect(normalizeLanguage('')).toBe('English');
    expect(normalizeLanguage('  Spanish  ')).toBe('Spanish');
  });
});
