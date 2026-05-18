import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEFAULT_HOSTED_BASE_URL, PROVIDERS } from '../../src/lib/settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(__dirname, '../../src/options/options.html');

async function mountOptionsDom() {
  const raw = await readFile(HTML_PATH, 'utf8');
  // Extract only the <body> contents so the document is sane under happy-dom.
  const match = /<body>([\s\S]*?)<\/body>/i.exec(raw);
  if (!match) throw new Error('options.html has no body');
  // Strip the script tag — we'll import options.js manually.
  const body = match[1].replace(/<script[\s\S]*?<\/script>/i, '');
  document.body.innerHTML = body;
}

async function importOptions() {
  vi.resetModules();
  await import('../../src/options/options.js');
  // The IIFE in options.js is async — yield a tick so settings load.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  vi.spyOn(globalThis, 'fetch');
  await mountOptionsDom();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('options page init', () => {
  it('populates the provider and language dropdowns', async () => {
    await importOptions();
    const providerSelect = document.getElementById('providerId');
    const langSelect = document.getElementById('preferredLanguage');

    expect(providerSelect.options.length).toBe(Object.keys(PROVIDERS).length);
    expect(langSelect.options.length).toBeGreaterThanOrEqual(6);

    const langValues = [...langSelect.options].map((o) => o.value);
    for (const v of ['English', 'Spanish', 'French', 'Japanese', 'Simplified Chinese', 'Traditional Chinese']) {
      expect(langValues).toContain(v);
    }
  });

  it('shows the grant block when the current provider lacks permission', async () => {
    await importOptions();
    const grantBlock = document.getElementById('grant-block');
    expect(grantBlock.hidden).toBe(false);
    expect(document.getElementById('grant-hint').textContent).toContain('openrouter.ai');
  });
});

describe('options page dirty tracking', () => {
  it('toggles the dirty hint when a field changes and back when reverted', async () => {
    await importOptions();
    const dirtyFlag = document.getElementById('dirty-flag');
    const modelInput = document.getElementById('model');
    expect(dirtyFlag.hidden).toBe(true);

    modelInput.value = 'something/new';
    modelInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(dirtyFlag.hidden).toBe(false);

    modelInput.value = '';
    modelInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(dirtyFlag.hidden).toBe(true);
  });
});

describe('options page grant + model load', () => {
  it('loads the model list after Allow access', async () => {
    // Mock the OpenRouter models endpoint.
    globalThis.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { id: 'openai/gpt-4.1-mini', name: '4.1 Mini' },
            { id: 'anthropic/claude-haiku-4-5' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await importOptions();
    document.getElementById('grant-btn').click();
    // Wait for fetch + populate.
    await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 10));

    const datalist = document.getElementById('model-list');
    expect(datalist.options.length).toBeGreaterThan(0);
    const values = [...datalist.options].map((o) => o.value);
    expect(values).toContain('openai/gpt-4.1-mini');
    expect(values).toContain('anthropic/claude-haiku-4-5');
    expect(document.getElementById('grant-block').hidden).toBe(true);
  });
});

describe('options page save', () => {
  it('refuses to save without host permission and surfaces the error', async () => {
    // Override request to deny.
    chrome.permissions.request.mockImplementationOnce(() => Promise.resolve(false));
    await importOptions();
    document.getElementById('apiKey').value = 'sk-test';
    document.getElementById('model').value = 'openai/gpt-4.1-mini';

    document.getElementById('settings-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const saveError = document.getElementById('save-error');
    expect(saveError.hidden).toBe(false);
    expect(saveError.textContent).toMatch(/permission .* not granted/i);

    const stored = await chrome.storage.local.get(null);
    expect(stored.apiKey).toBeUndefined();
  });

  it('persists settings and clears the dirty flag on successful save', async () => {
    chrome.permissions._grant(PROVIDERS.openrouter.hostPermission);
    await chrome.storage.local.set({ providerMode: 'custom' });
    globalThis.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await importOptions();
    const apiKey = document.getElementById('apiKey');
    const model = document.getElementById('model');
    apiKey.value = 'sk-test';
    model.value = 'openai/gpt-4.1-mini';
    apiKey.dispatchEvent(new Event('input', { bubbles: true }));
    model.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.getElementById('dirty-flag').hidden).toBe(false);

    document.getElementById('settings-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const stored = await chrome.storage.local.get(null);
    expect(stored.apiKey).toBe('sk-test');
    expect(stored.model).toBe('openai/gpt-4.1-mini');
    expect(document.getElementById('dirty-flag').hidden).toBe(true);
    expect(document.getElementById('saved-flag').hidden).toBe(false);
  });
});

describe('options page hosted mode', () => {
  function selectHosted() {
    const radio = document.querySelector('input[name="providerMode"][value="hosted"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function selectCustom() {
    const radio = document.querySelector('input[name="providerMode"][value="custom"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('defaults to hosted mode when nothing is stored', async () => {
    await importOptions();
    const checked = document.querySelector('input[name="providerMode"]:checked');
    expect(checked.value).toBe('hosted');
    expect(document.getElementById('hosted-section').hidden).toBe(false);
    expect(document.getElementById('custom-section').hidden).toBe(true);
  });

  it('toggling between modes swaps which section is shown', async () => {
    await importOptions();
    selectCustom();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById('hosted-section').hidden).toBe(true);
    expect(document.getElementById('custom-section').hidden).toBe(false);
    expect(document.getElementById('dirty-flag').hidden).toBe(false);

    selectHosted();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById('hosted-section').hidden).toBe(false);
    expect(document.getElementById('custom-section').hidden).toBe(true);
  });

  it('shows the hosted grant block until permission is granted', async () => {
    await importOptions();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const grantBlock = document.getElementById('hosted-grant-block');
    expect(grantBlock.hidden).toBe(false);
    expect(document.getElementById('hosted-grant-hint').textContent).toContain(
      new URL(DEFAULT_HOSTED_BASE_URL).host,
    );

    document.getElementById('hosted-grant-btn').click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(grantBlock.hidden).toBe(true);
  });

  it('save persists providerMode=hosted with hostedBaseUrl and clears stale consent', async () => {
    // Pre-seed BYOK consent so we can verify it's reset when scope changes.
    await chrome.storage.local.set({
      providerMode: 'custom',
      providerId: 'openrouter',
      apiKey: 'sk-old',
      model: 'm',
      preferredLanguage: 'English',
      consented: true,
      consentedProviderFingerprint: 'stale|fingerprint',
    });

    await importOptions();
    selectHosted();
    await new Promise((r) => setTimeout(r, 0));

    document.getElementById('settings-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const stored = await chrome.storage.local.get(null);
    expect(stored.providerMode).toBe('hosted');
    expect(stored.hostedBaseUrl).toBe(DEFAULT_HOSTED_BASE_URL);
    expect(stored.consented).toBe(false);
    expect(stored.consentedProviderFingerprint).toBe('');
    expect(document.getElementById('saved-flag').hidden).toBe(false);
  });

  it('refuses to save hosted mode without host permission', async () => {
    chrome.permissions.request.mockImplementationOnce(() => Promise.resolve(false));
    await importOptions();
    selectHosted();
    await new Promise((r) => setTimeout(r, 0));

    document.getElementById('settings-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const saveError = document.getElementById('save-error');
    expect(saveError.hidden).toBe(false);
    expect(saveError.textContent).toMatch(/permission .* not granted/i);
    const stored = await chrome.storage.local.get(null);
    expect(stored.providerMode).toBeUndefined();
  });

  it('restores hosted radio on reload when providerMode is stored as hosted', async () => {
    await chrome.storage.local.set({
      providerMode: 'hosted',
      hostedBaseUrl: 'http://localhost:54321/functions/v1',
      preferredLanguage: 'English',
    });
    await importOptions();
    const checked = document.querySelector('input[name="providerMode"]:checked');
    expect(checked.value).toBe('hosted');
    expect(document.getElementById('hosted-section').hidden).toBe(false);
    expect(document.getElementById('custom-section').hidden).toBe(true);
  });
});
