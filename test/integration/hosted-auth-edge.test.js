// Edge branches in hosted-auth.js that the main hosted-auth.test.js doesn't
// cover. These are mostly defensive try/catch paths and config-misconfig
// branches.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  signInWithGoogle,
  signOut,
  fetchWhoami,
  ensureHostedSession,
  parseAuthCallback,
} from '../../src/background/hosted-auth.js';
import { setSettings, getSettings } from '../../src/lib/settings.js';

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const HOSTED_BASE = 'http://localhost:54321/functions/v1';
const AUTH_BASE = 'http://localhost:54321/auth/v1';

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hosted-auth misconfig + edge branches', () => {
  it('ensureHostedSession throws when base URL or anon key is missing', async () => {
    await setSettings({ providerMode: 'hosted', hostedBaseUrl: '', hostedAnonKey: '' });
    const settings = await getSettings();
    await expect(ensureHostedSession(settings)).rejects.toThrow(/misconfigured/);
  });

  it('signInWithGoogle throws when chrome.identity is missing', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: 'k',
    });
    const settings = await getSettings();
    const savedIdentity = chrome.identity;
    delete chrome.identity;
    try {
      await expect(signInWithGoogle(settings)).rejects.toThrow(/chrome.identity API unavailable/);
    } finally {
      chrome.identity = savedIdentity;
    }
  });

  it('signInWithGoogle throws when hosted base URL is missing', async () => {
    await setSettings({ providerMode: 'hosted', hostedBaseUrl: '', hostedAnonKey: 'k' });
    const settings = await getSettings();
    await expect(signInWithGoogle(settings)).rejects.toThrow(/misconfigured/);
  });

  it('signInWithGoogle throws when callback URL has tokens missing', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: 'k',
    });
    const settings = await getSettings();
    chrome.identity._setLaunchWebAuthFlowResponse(
      'https://test.chromiumapp.org/#token_type=bearer', // no access_token / refresh_token
    );
    await expect(signInWithGoogle(settings)).rejects.toThrow(/no tokens were returned/);
  });

  it('fetchWhoami throws on non-2xx', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: 'k',
      hostedAccessToken: 'at',
    });
    const settings = await getSettings();
    globalThis.fetch.mockResolvedValueOnce(new Response('bad', { status: 500 }));
    await expect(fetchWhoami(settings)).rejects.toThrow(/whoami failed/);
  });

  it('fetchWhoami: returns null when base URL missing', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: '',
      hostedAnonKey: 'k',
      hostedAccessToken: 'at',
    });
    const settings = await getSettings();
    expect(await fetchWhoami(settings)).toBeNull();
  });

  it('fetchWhoami caches missing stripe block gracefully', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: 'k',
      hostedAccessToken: 'at',
    });
    const settings = await getSettings();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({
        subjectId: 'user-1',
        tier: 'pro',
        isAnonymous: false,
        // no stripe field at all
      }),
    );
    const result = await fetchWhoami(settings);
    expect(result.subscriptionStatus).toBe('');
    expect(result.currentPeriodEnd).toBe('');
  });

  it('signOut tolerates missing token (skips POST entirely)', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: 'k',
      hostedAccessToken: '',
    });
    const settings = await getSettings();
    await signOut(settings); // should not call fetch
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const fresh = await getSettings();
    expect(fresh.hostedTier).toBe('free');
  });

  it('signOut: anonKey missing → skips POST', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: '',
      hostedAccessToken: 'at',
    });
    const settings = await getSettings();
    await signOut(settings);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('ensureHostedSession: signup with malformed shape throws', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: 'k',
    });
    const settings = await getSettings();
    // No refresh token → goes straight to signup. Signup returns 200 but
    // without the required fields.
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ access_token: 'a' /* no user.id */ }));
    await expect(ensureHostedSession(settings)).rejects.toThrow(/unexpected shape/);
  });

  it('ensureHostedSession: signup non-200 with body detail surfaces', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: 'k',
    });
    const settings = await getSettings();
    globalThis.fetch.mockResolvedValueOnce(
      new Response('{"msg":"forbidden"}', { status: 403 }),
    );
    await expect(ensureHostedSession(settings)).rejects.toThrow(/Anonymous signup failed/);
  });

  it('ensureHostedSession: refresh returns shape without user.id → throws', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: 'k',
      hostedRefreshToken: 'rt',
    });
    const settings = await getSettings();
    // First fetch: refresh returns 200 but malformed; second fetch: anon
    // signup fallback succeeds. End result: caller sees the fresh anon
    // session (refresh failure → falls back).
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ access_token: 'a' /* no user */ }))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'anon-at',
          refresh_token: 'anon-rt',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: 'anon-user' },
        }),
      );
    const result = await ensureHostedSession(settings);
    expect(result.subjectId).toBe('anon-user');
  });

  it('parseAuthCallback: handles trailing # with no params', () => {
    const out = parseAuthCallback('https://x.test/#');
    expect(out).toEqual({});
  });
});
