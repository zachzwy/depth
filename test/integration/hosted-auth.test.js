import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseAuthCallback,
  signInWithGoogle,
  signOut,
  fetchWhoami,
  ensureHostedSession,
} from '../../src/background/hosted-auth.js';
import { getSettings, setSettings, DEFAULTS } from '../../src/lib/settings.js';

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const HOSTED_BASE = 'http://localhost:54321/functions/v1';
const AUTH_BASE = 'http://localhost:54321/auth/v1';

async function baseSettings(overrides = {}) {
  await setSettings({
    providerMode: 'hosted',
    hostedBaseUrl: HOSTED_BASE,
    hostedAnonKey: 'anon-key',
    ...overrides,
  });
  return getSettings();
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
  // ensureHostedSession now refuses before any /auth/v1 call when the
  // hosted host permission isn't granted. These tests exercise the auth
  // flow, not the permission gate, so grant it up front.
  chrome.permissions._grant('http://localhost:54321/*');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseAuthCallback', () => {
  it('parses tokens from the URL fragment', () => {
    const url = 'https://test.chromiumapp.org/#access_token=at&refresh_token=rt&expires_at=1700000000&token_type=bearer';
    const parsed = parseAuthCallback(url);
    expect(parsed.access_token).toBe('at');
    expect(parsed.refresh_token).toBe('rt');
    expect(parsed.expires_at).toBe('1700000000');
  });

  it('parses error responses', () => {
    const url = 'https://test.chromiumapp.org/#error=access_denied&error_description=User+canceled';
    const parsed = parseAuthCallback(url);
    expect(parsed.error).toBe('access_denied');
    expect(parsed.error_description).toBe('User canceled');
  });

  it('falls back to query params if no hash', () => {
    const url = 'https://test.chromiumapp.org/?access_token=at&refresh_token=rt';
    const parsed = parseAuthCallback(url);
    expect(parsed.access_token).toBe('at');
  });

  it('returns error on bad URL', () => {
    expect(parseAuthCallback('not-a-url').error).toBe('invalid_url');
  });
});

describe('signInWithGoogle', () => {
  it('opens the OAuth flow, exchanges the response, and stores tokens', async () => {
    const settings = await baseSettings();

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    chrome.identity._setLaunchWebAuthFlowResponse(
      `https://test.chromiumapp.org/#access_token=google-at&refresh_token=google-rt&expires_at=${futureExp}&token_type=bearer`,
    );

    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ id: 'user-1', email: 'a@b.co' })) // /auth/v1/user
      .mockResolvedValueOnce(jsonResponse({
        subjectId: 'user-1',
        tier: 'free',
        isAnonymous: false,
        stripe: { hasCustomer: false, subscriptionStatus: null, currentPeriodEnd: null },
      })); // /v1/auth/whoami (called via fetchWhoami)

    const result = await signInWithGoogle(settings);

    expect(result.accessToken).toBe('google-at');
    expect(result.subjectId).toBe('user-1');
    expect(result.email).toBe('a@b.co');

    // Persisted into storage too.
    const fresh = await getSettings();
    expect(fresh.hostedAccessToken).toBe('google-at');
    expect(fresh.hostedRefreshToken).toBe('google-rt');
    expect(fresh.hostedSubjectId).toBe('user-1');
    expect(fresh.hostedIsAnonymous).toBe(false);
    expect(fresh.hostedEmail).toBe('a@b.co');
    expect(fresh.hostedTier).toBe('free');

    // First fetch: /auth/v1/user with the access token; second: /v1/whoami.
    expect(globalThis.fetch.mock.calls[0][0]).toBe(`${AUTH_BASE}/user`);
    expect(globalThis.fetch.mock.calls[1][0]).toBe(`${HOSTED_BASE}/whoami`);
  });

  it('rejects when chrome.runtime.lastError is set', async () => {
    const settings = await baseSettings();
    chrome.identity._setLaunchWebAuthFlowResponse({ error: 'User declined' });
    await expect(signInWithGoogle(settings)).rejects.toThrow(/User declined/);
  });

  it('rejects when the callback URL carries an error param', async () => {
    const settings = await baseSettings();
    chrome.identity._setLaunchWebAuthFlowResponse(
      'https://test.chromiumapp.org/#error=server_error&error_description=Whoops',
    );
    await expect(signInWithGoogle(settings)).rejects.toThrow(/Whoops/);
  });
});

describe('signInWithGoogle: link-identity path', () => {
  it('with a live anon session, calls /user/identities/authorize and uses the returned URL', async () => {
    const settings = await baseSettings({
      hostedAccessToken: 'anon-at',
      hostedRefreshToken: 'anon-rt',
      hostedAccessTokenExpiresAt: Date.now() + 10 * 60 * 1000, // fresh
      hostedSubjectId: 'anon-subject-id',
      hostedIsAnonymous: true,
    });

    const upstreamGoogleUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=LINK_STATE';
    const futureExp = Math.floor(Date.now() / 1000) + 3600;

    chrome.identity._setLaunchWebAuthFlowResponse(
      `https://test.chromiumapp.org/#access_token=linked-at&refresh_token=linked-rt&expires_at=${futureExp}&token_type=bearer`,
    );

    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ url: upstreamGoogleUrl })) // GET /user/identities/authorize
      .mockResolvedValueOnce(jsonResponse({ id: 'anon-subject-id', email: 'me@gmail.com' })) // /auth/v1/user
      .mockResolvedValueOnce(jsonResponse({
        subjectId: 'anon-subject-id',
        tier: 'free',
        isAnonymous: false,
        stripe: { hasCustomer: false, subscriptionStatus: null, currentPeriodEnd: null },
      })); // /v1/whoami

    const result = await signInWithGoogle(settings);

    expect(result.linked).toBe(true);
    // Same subject id — that's the whole point of linking.
    expect(result.subjectId).toBe('anon-subject-id');

    // First fetch is the link-identity authorize call with the anon bearer.
    const [linkUrl, linkInit] = globalThis.fetch.mock.calls[0];
    expect(linkUrl).toBe(`${AUTH_BASE}/user/identities/authorize?provider=google&redirect_to=https%3A%2F%2Ftest.chromiumapp.org%2F&skip_http_redirect=true`);
    expect(linkInit.headers.authorization).toBe('Bearer anon-at');
    expect(linkInit.headers.apikey).toBe('anon-key');

    // launchWebAuthFlow was called with the upstream URL we got back, not
    // the plain /authorize URL.
    expect(chrome.identity.launchWebAuthFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: upstreamGoogleUrl }),
      expect.any(Function),
    );

    const fresh = await getSettings();
    expect(fresh.hostedSubjectId).toBe('anon-subject-id');
    expect(fresh.hostedIsAnonymous).toBe(false);
    expect(fresh.hostedEmail).toBe('me@gmail.com');
  });

  it('falls back to plain /authorize when the link call returns 4xx', async () => {
    const settings = await baseSettings({
      hostedAccessToken: 'anon-at',
      hostedAccessTokenExpiresAt: Date.now() + 10 * 60 * 1000,
      hostedSubjectId: 'anon-subject-id',
      hostedIsAnonymous: true,
    });

    const futureExp = Math.floor(Date.now() / 1000) + 3600;

    chrome.identity._setLaunchWebAuthFlowResponse(
      `https://test.chromiumapp.org/#access_token=fresh-at&refresh_token=fresh-rt&expires_at=${futureExp}&token_type=bearer`,
    );

    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ msg: 'identity_already_exists' }, { status: 422 })) // link call fails
      .mockResolvedValueOnce(jsonResponse({ id: 'new-subject-id', email: 'me@gmail.com' })) // /auth/v1/user for new session
      .mockResolvedValueOnce(jsonResponse({
        subjectId: 'new-subject-id',
        tier: 'free',
        isAnonymous: false,
        stripe: { hasCustomer: false, subscriptionStatus: null, currentPeriodEnd: null },
      })); // /v1/whoami

    const result = await signInWithGoogle(settings);

    // Sign-in still succeeded, but linked=false because we fell back.
    expect(result.linked).toBe(false);
    expect(result.subjectId).toBe('new-subject-id');

    // launchWebAuthFlow URL is the plain /authorize URL, not whatever the
    // failed link call would have returned.
    const launchCall = chrome.identity.launchWebAuthFlow.mock.calls[0][0];
    expect(launchCall.url).toBe(
      `${AUTH_BASE}/authorize?provider=google&redirect_to=https%3A%2F%2Ftest.chromiumapp.org%2F`,
    );
  });

  it('does NOT call the link endpoint when there is no anonymous session', async () => {
    const settings = await baseSettings(); // no token at all

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    chrome.identity._setLaunchWebAuthFlowResponse(
      `https://test.chromiumapp.org/#access_token=fresh-at&refresh_token=fresh-rt&expires_at=${futureExp}&token_type=bearer`,
    );

    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ id: 'user-1', email: 'a@b.co' }))
      .mockResolvedValueOnce(jsonResponse({
        subjectId: 'user-1',
        tier: 'free',
        isAnonymous: false,
        stripe: { hasCustomer: false, subscriptionStatus: null, currentPeriodEnd: null },
      }));

    const result = await signInWithGoogle(settings);
    expect(result.linked).toBe(false);

    // First (and second) fetch should be /auth/v1/user, NOT the link
    // endpoint — the link call would have been a third entry.
    for (const call of globalThis.fetch.mock.calls) {
      expect(call[0]).not.toContain('/user/identities/authorize');
    }
  });

  it('does NOT call the link endpoint when the existing session is not anonymous', async () => {
    const settings = await baseSettings({
      hostedAccessToken: 'permanent-at',
      hostedRefreshToken: 'permanent-rt',
      hostedAccessTokenExpiresAt: Date.now() + 10 * 60 * 1000,
      hostedSubjectId: 'permanent-id',
      hostedIsAnonymous: false,
      hostedEmail: 'old@user.com',
    });

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    chrome.identity._setLaunchWebAuthFlowResponse(
      `https://test.chromiumapp.org/#access_token=new-at&refresh_token=new-rt&expires_at=${futureExp}&token_type=bearer`,
    );

    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ id: 'permanent-id', email: 'old@user.com' }))
      .mockResolvedValueOnce(jsonResponse({
        subjectId: 'permanent-id',
        tier: 'pro',
        isAnonymous: false,
        stripe: { hasCustomer: true, subscriptionStatus: 'active', currentPeriodEnd: null },
      }));

    const result = await signInWithGoogle(settings);
    expect(result.linked).toBe(false);
    for (const call of globalThis.fetch.mock.calls) {
      expect(call[0]).not.toContain('/user/identities/authorize');
    }
  });
});

describe('signOut', () => {
  it('clears local tokens and posts /auth/v1/logout', async () => {
    const settings = await baseSettings({
      hostedAccessToken: 'at',
      hostedRefreshToken: 'rt',
      hostedSubjectId: 'user-1',
      hostedEmail: 'a@b.co',
      hostedIsAnonymous: false,
      hostedTier: 'pro',
    });

    globalThis.fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await signOut(settings);

    const fresh = await getSettings();
    expect(fresh.hostedAccessToken).toBe('');
    expect(fresh.hostedRefreshToken).toBe('');
    expect(fresh.hostedSubjectId).toBe('');
    expect(fresh.hostedEmail).toBe('');
    expect(fresh.hostedIsAnonymous).toBe(true);
    expect(fresh.hostedTier).toBe('free');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${AUTH_BASE}/logout`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('clears local state even when /logout POST fails', async () => {
    const settings = await baseSettings({
      hostedAccessToken: 'at',
      hostedRefreshToken: 'rt',
      hostedSubjectId: 'user-1',
    });
    globalThis.fetch.mockRejectedValueOnce(new Error('network down'));

    await signOut(settings);

    const fresh = await getSettings();
    expect(fresh.hostedAccessToken).toBe('');
    expect(fresh.hostedRefreshToken).toBe('');
  });
});

describe('fetchWhoami', () => {
  it('caches tier + subscription details into settings', async () => {
    const settings = await baseSettings({
      hostedAccessToken: 'at',
      hostedRefreshToken: 'rt',
      hostedSubjectId: 'user-1',
      hostedEmail: 'a@b.co',
      hostedIsAnonymous: false,
    });
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({
      subjectId: 'user-1',
      tier: 'pro',
      isAnonymous: false,
      stripe: {
        hasCustomer: true,
        subscriptionStatus: 'active',
        currentPeriodEnd: '2026-06-17T00:00:00.000Z',
      },
    }));

    const result = await fetchWhoami(settings);

    expect(result.tier).toBe('pro');
    expect(result.subscriptionStatus).toBe('active');
    const fresh = await getSettings();
    expect(fresh.hostedTier).toBe('pro');
    expect(fresh.hostedSubscriptionStatus).toBe('active');
    expect(fresh.hostedCurrentPeriodEnd).toBe('2026-06-17T00:00:00.000Z');
  });

  it('returns null when no access token is present', async () => {
    const settings = await baseSettings();
    const result = await fetchWhoami(settings);
    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('ensureHostedSession', () => {
  it('uses the refresh token in preference to anonymous signup', async () => {
    const settings = await baseSettings({
      hostedRefreshToken: 'rt',
      // Token expired an hour ago.
      hostedAccessTokenExpiresAt: Date.now() - 3600_000,
    });

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({
      access_token: 'refreshed-at',
      refresh_token: 'refreshed-rt',
      expires_at: futureExp,
      user: { id: 'user-1' },
    }));

    const result = await ensureHostedSession(settings);
    expect(result.accessToken).toBe('refreshed-at');
    expect(result.subjectId).toBe('user-1');

    const fresh = await getSettings();
    expect(fresh.hostedRefreshToken).toBe('refreshed-rt');
    expect(globalThis.fetch.mock.calls[0][0]).toBe(`${AUTH_BASE}/token?grant_type=refresh_token`);
  });

  it('falls back to anonymous signup when the refresh token is rejected', async () => {
    const settings = await baseSettings({
      hostedRefreshToken: 'rt-revoked',
      hostedAccessTokenExpiresAt: 0,
    });

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse({ msg: 'revoked' }, { status: 400 })) // refresh fails
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'anon-at',
        refresh_token: 'anon-rt',
        expires_at: futureExp,
        user: { id: 'anon-user' },
      })); // anon signup

    const result = await ensureHostedSession(settings);
    expect(result.accessToken).toBe('anon-at');
    expect(result.subjectId).toBe('anon-user');

    const fresh = await getSettings();
    expect(fresh.hostedIsAnonymous).toBe(true);
  });

  it('returns the cached token when still fresh', async () => {
    const settings = await baseSettings({
      hostedAccessToken: 'still-valid',
      hostedRefreshToken: 'rt',
      hostedAccessTokenExpiresAt: Date.now() + 10 * 60 * 1000,
      hostedSubjectId: 'user-1',
    });
    const result = await ensureHostedSession(settings);
    expect(result.accessToken).toBe('still-valid');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('DEFAULTS', () => {
  it('includes the new phase-4 fields', () => {
    expect(DEFAULTS).toHaveProperty('hostedRefreshToken', '');
    expect(DEFAULTS).toHaveProperty('hostedIsAnonymous', true);
    expect(DEFAULTS).toHaveProperty('hostedTier', 'free');
    expect(DEFAULTS).toHaveProperty('hostedEmail', '');
  });
});
