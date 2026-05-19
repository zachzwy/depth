// Depth Hosted auth: anonymous → permanent Supabase Auth session
// management for the extension.
//
// Three flows live here:
//
//   1. ensureHostedSession(settings) — called before every hosted request
//      by service-worker.js. Holds a valid access token, using (in order):
//        a) the current non-expired token, if any
//        b) a refresh-token exchange when we have one (preserves the same
//           auth.users.id — anonymous or permanent)
//        c) a fresh anonymous signup as the final fallback
//
//   2. signInWithGoogle(settings) — interactive flow via
//      chrome.identity.launchWebAuthFlow. Replaces whatever session
//      settings carry (anonymous or otherwise) with a Google-backed one.
//      NOTE: this does NOT yet link an existing anonymous identity into
//      the Google account, so a user who signs in after hitting their
//      anon quota starts fresh as the permanent account. See
//      depth-api/docs/PLAN.md Phase 4 for the planned merge path.
//
//   3. signOut(settings) — clears local tokens + posts /auth/v1/logout
//      so the server-side session is invalidated too. Subsequent calls
//      to ensureHostedSession will mint a new anonymous session.
//
// Why a custom client instead of @supabase/supabase-js: the SDK is ~100 KB
// and pulls in fetch polyfills the extension doesn't need. The flows here
// are a handful of POSTs that we can write directly.

import { setSettings, getSettings } from '../lib/settings.js';
import { assertHostedPermission, HostedError } from './hosted-client.js';

// Refresh slightly before exp to avoid edge-of-window failures.
const EXPIRY_SAFETY_MARGIN_MS = 60 * 1000;

/**
 * Ensure the supplied settings object carries a non-expired hosted access
 * token. Mutates `settings` in place AND persists via chrome.storage.local.
 *
 * @returns {Promise<{ accessToken: string, subjectId: string }>}
 * @throws if every fallback path fails — caller surfaces as a HostedError.
 */
export async function ensureHostedSession(settings) {
  const now = Date.now();
  if (
    settings.hostedAccessToken &&
    settings.hostedAccessTokenExpiresAt &&
    settings.hostedAccessTokenExpiresAt - EXPIRY_SAFETY_MARGIN_MS > now
  ) {
    return {
      accessToken: settings.hostedAccessToken,
      subjectId: settings.hostedSubjectId,
    };
  }

  const authUrl = deriveAuthUrl(settings.hostedBaseUrl);
  const anonKey = settings.hostedAnonKey;
  if (!authUrl || !anonKey) {
    throw new Error('Hosted auth misconfigured: missing base URL or anon key');
  }

  // Refuse before any /auth/v1 fetch so a fresh install (no host
  // permission yet) gets a HostedError the panel can render as the
  // permission card instead of an opaque fetch failure.
  await assertHostedPermission(settings);

  // Prefer a refresh-token exchange when we have one. Preserves auth.users.id
  // for both anonymous and permanent sessions; anonymous-signup fallback
  // would create a brand-new auth.users row and forfeit the prior identity.
  if (settings.hostedRefreshToken) {
    try {
      const refreshed = await exchangeRefreshToken(authUrl, anonKey, settings.hostedRefreshToken);
      await applySession(settings, refreshed);
      return { accessToken: refreshed.access_token, subjectId: refreshed.user.id };
    } catch (err) {
      // Refresh failed (token revoked, expired, server problem). Fall
      // through to anonymous signup — but clear the stale refresh token
      // first so we don't retry the same dead value on the next call.
      console.warn('[hosted-auth] refresh failed, falling back to anon signup:', err.message);
      await clearLocalSession(settings);
    }
  }

  let signup;
  try {
    signup = await anonSignup(authUrl, anonKey);
  } catch (err) {
    if (err?.code === 'CAPTCHA_REQUIRED') {
      // The panel renders a CaptchaCard for this code; the SW handler
      // owning the user-gesture click then calls completeHostedSignupWithCaptcha.
      throw new HostedError({
        code: 'CAPTCHA_REQUIRED',
        message: 'Captcha verification required to start an anonymous session.',
      });
    }
    throw err;
  }
  await applySession(settings, { ...signup, isAnonymous: true, email: '' });
  return { accessToken: signup.access_token, subjectId: signup.user.id };
}

/**
 * Interactive Google sign-in.
 *
 * Two paths:
 *
 *   - **Link path** (preferred). If we currently hold a valid anonymous
 *     session, hit GET `/auth/v1/user/identities/authorize` with the anon
 *     bearer to obtain a link-flavored upstream OAuth URL. Completing
 *     this flow keeps the same `auth.users.id` — usage_counters and the
 *     public.users profile carry forward without merge code.
 *
 *   - **Plain path** (fallback). For all other cases (no anon session,
 *     anon session expired and refresh also fails, or the link call
 *     returned 4xx for any reason), hit `/auth/v1/authorize` directly.
 *     This creates a fresh permanent user; any anon usage_counters rows
 *     are orphaned.
 *
 * Returns `{ linked }` so the caller can surface a "carried over your
 * anonymous usage" hint when true.
 *
 * @returns {Promise<{ accessToken: string, subjectId: string, email: string, tier: 'free'|'pro', linked: boolean }>}
 * @throws if the user cancels, the OAuth provider returns an error, or
 *   neither path can build a launch URL.
 */
export async function signInWithGoogle(settings) {
  const authUrl = deriveAuthUrl(settings.hostedBaseUrl);
  const anonKey = settings.hostedAnonKey;
  if (!authUrl || !anonKey) {
    throw new Error('Hosted auth misconfigured: missing base URL or anon key');
  }
  if (!chrome.identity?.launchWebAuthFlow) {
    throw new Error('chrome.identity API unavailable — check the `identity` permission.');
  }

  const redirectUrl = chrome.identity.getRedirectURL();

  let oauthUrl = null;
  let attemptedLink = false;
  if (settings.hostedIsAnonymous && settings.hostedAccessToken) {
    attemptedLink = true;
    try {
      // Refresh the anon access token first if it's about to expire — a
      // stale bearer would bounce the link call with 401 and force us
      // into the plain path even though linking would have worked.
      await ensureHostedSession(settings);
      if (settings.hostedIsAnonymous && settings.hostedAccessToken) {
        oauthUrl = await getLinkIdentityUrl(settings, 'google', redirectUrl);
      }
    } catch (err) {
      console.warn('[hosted-auth] link-identity URL fetch failed, falling back to plain sign-in:', err.message);
      oauthUrl = null;
    }
  }
  const linked = Boolean(oauthUrl);
  if (!oauthUrl) {
    oauthUrl = `${authUrl}/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;
  }

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: oauthUrl, interactive: true },
      (urlOrUndefined) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message || 'OAuth flow failed'));
          return;
        }
        if (!urlOrUndefined) {
          reject(new Error('OAuth flow returned no URL'));
          return;
        }
        resolve(urlOrUndefined);
      },
    );
  });

  const session = parseAuthCallback(responseUrl);
  if (session.error) {
    throw new Error(`Google sign-in failed: ${session.error_description || session.error}`);
  }
  if (!session.access_token || !session.refresh_token) {
    throw new Error('Google sign-in succeeded but no tokens were returned.');
  }

  // We don't have the user object from the URL fragment, only the tokens.
  // Pull /auth/v1/user with the new access token to get user.id + email.
  // For the link path, this id should match the anon subject id we held
  // before — that's the whole point. (Not asserted here; tests check it.)
  const user = await fetchAuthUser(authUrl, anonKey, session.access_token);

  await applySession(settings, {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Number(session.expires_at) || 0,
    user,
    isAnonymous: false,
    email: user.email ?? '',
  });

  const whoami = await fetchWhoami(settings).catch((err) => {
    // Whoami enriches the cached account projection; failing here doesn't
    // invalidate the sign-in itself, so we log and carry on with what we
    // already wrote.
    console.warn('[hosted-auth] whoami after sign-in failed:', err.message);
    return null;
  });

  return {
    accessToken: session.access_token,
    subjectId: user.id,
    email: user.email ?? '',
    tier: whoami?.tier ?? 'free',
    linked: attemptedLink && linked,
  };
}

/**
 * Call GET /auth/v1/user/identities/authorize with the current (anonymous)
 * session's bearer to obtain a link-flavored upstream OAuth URL. The
 * Supabase callback that handles the eventual response from Google will
 * link the new identity to the existing user rather than create a new
 * one — preserving auth.users.id.
 *
 * `skip_http_redirect=true` flips the endpoint from a 302 to a JSON
 * response. Without it, fetch would follow the redirect and we'd end up
 * with the Google login page HTML in the response body.
 */
async function getLinkIdentityUrl(settings, provider, redirectUrl) {
  const authUrl = deriveAuthUrl(settings.hostedBaseUrl);
  const params = new URLSearchParams({
    provider,
    redirect_to: redirectUrl,
    skip_http_redirect: 'true',
  });
  const url = `${authUrl}/user/identities/authorize?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: settings.hostedAnonKey,
      authorization: `Bearer ${settings.hostedAccessToken}`,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `link-identity authorize failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
  }
  const json = await res.json();
  if (!json?.url) throw new Error('link-identity authorize returned no url');
  return json.url;
}

/**
 * Clear the local session and tell the server to revoke the access token.
 * Subsequent hosted calls will mint a fresh anonymous session via
 * ensureHostedSession.
 */
export async function signOut(settings) {
  const authUrl = deriveAuthUrl(settings.hostedBaseUrl);
  const anonKey = settings.hostedAnonKey;
  const token = settings.hostedAccessToken;

  if (authUrl && anonKey && token) {
    // Best-effort. A 401 here (token already invalid) is fine.
    try {
      await fetch(`${authUrl}/logout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: anonKey,
          authorization: `Bearer ${token}`,
        },
      });
    } catch (err) {
      console.warn('[hosted-auth] logout POST failed:', err.message);
    }
  }

  await clearLocalSession(settings);
}

/**
 * Refresh the cached account projection from /v1/auth/whoami. Useful after
 * an upgrade flow completes (webhook updates users.tier server-side; this
 * fetches the new tier into the extension UI).
 *
 * @returns {Promise<{ subjectId: string, tier: 'free'|'pro', isAnonymous: boolean, email: string, subscriptionStatus: string|null, currentPeriodEnd: string|null } | null>}
 */
export async function fetchWhoami(settings) {
  const baseUrl = (settings.hostedBaseUrl ?? '').replace(/\/+$/, '');
  if (!baseUrl) return null;
  if (!settings.hostedAccessToken) return null;

  const res = await fetch(`${baseUrl}/whoami`, {
    headers: {
      authorization: `Bearer ${settings.hostedAccessToken}`,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`whoami failed (${res.status})`);
  }
  const json = await res.json();

  const tier = json.tier === 'pro' ? 'pro' : 'free';
  const isAnonymous = Boolean(json.isAnonymous);
  const subscriptionStatus = json.stripe?.subscriptionStatus ?? '';
  const currentPeriodEnd = json.stripe?.currentPeriodEnd ?? '';
  const trialEligible = Boolean(json.trialEligible);
  // /v1/auth/whoami currently doesn't surface email; pull from settings if
  // we have it (sign-in set it). A future server-side enrichment can stop
  // this from being best-effort.
  const email = settings.hostedEmail ?? '';

  settings.hostedTier = tier;
  settings.hostedIsAnonymous = isAnonymous;
  settings.hostedSubscriptionStatus = subscriptionStatus;
  settings.hostedCurrentPeriodEnd = currentPeriodEnd;
  settings.hostedTrialEligible = trialEligible;
  await setSettings({
    hostedTier: tier,
    hostedIsAnonymous: isAnonymous,
    hostedSubscriptionStatus: subscriptionStatus,
    hostedCurrentPeriodEnd: currentPeriodEnd,
    hostedTrialEligible: trialEligible,
  });

  return {
    subjectId: json.subjectId,
    tier,
    isAnonymous,
    email,
    subscriptionStatus,
    currentPeriodEnd,
    trialEligible,
  };
}

/**
 * Parse the OAuth callback URL into its hash params. Supabase returns
 * `#access_token=...&refresh_token=...&expires_at=...&token_type=bearer`
 * on success or `#error=...&error_description=...` on failure. Some
 * providers use query params instead of hash; we accept both.
 */
export function parseAuthCallback(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { error: 'invalid_url' };
  }
  // Strip the leading '#' or '?' before USearchParams parsing.
  const hash = u.hash?.startsWith('#') ? u.hash.slice(1) : u.hash;
  const params = new URLSearchParams(hash || u.search);
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

// ---- private helpers ----

async function applySession(settings, session) {
  const expiresAtSec =
    typeof session.expires_at === 'number' && session.expires_at > 0
      ? session.expires_at
      : Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);
  const expiresAtMs = expiresAtSec * 1000;

  settings.hostedAccessToken = session.access_token;
  settings.hostedRefreshToken = session.refresh_token ?? '';
  settings.hostedAccessTokenExpiresAt = expiresAtMs;
  settings.hostedSubjectId = session.user.id;
  if ('isAnonymous' in session) settings.hostedIsAnonymous = session.isAnonymous;
  if ('email' in session) settings.hostedEmail = session.email ?? '';

  await setSettings({
    hostedAccessToken: settings.hostedAccessToken,
    hostedRefreshToken: settings.hostedRefreshToken,
    hostedAccessTokenExpiresAt: expiresAtMs,
    hostedSubjectId: settings.hostedSubjectId,
    ...(('isAnonymous' in session) ? { hostedIsAnonymous: session.isAnonymous } : {}),
    ...(('email' in session) ? { hostedEmail: session.email ?? '' } : {}),
  });
}

async function clearLocalSession(settings) {
  settings.hostedAccessToken = '';
  settings.hostedRefreshToken = '';
  settings.hostedAccessTokenExpiresAt = 0;
  settings.hostedSubjectId = '';
  settings.hostedIsAnonymous = true;
  settings.hostedEmail = '';
  settings.hostedTier = 'free';
  settings.hostedSubscriptionStatus = '';
  settings.hostedCurrentPeriodEnd = '';
  settings.hostedTrialEligible = false;
  await setSettings({
    hostedAccessToken: '',
    hostedRefreshToken: '',
    hostedAccessTokenExpiresAt: 0,
    hostedSubjectId: '',
    hostedIsAnonymous: true,
    hostedEmail: '',
    hostedTier: 'free',
    hostedSubscriptionStatus: '',
    hostedCurrentPeriodEnd: '',
    hostedTrialEligible: false,
  });
}

async function anonSignup(authUrl, anonKey, captchaToken) {
  const body = captchaToken
    ? { data: {}, gotrue_meta_security: { captcha_token: captchaToken } }
    : { data: {} };
  const res = await fetch(`${authUrl}/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: anonKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Supabase returns 400 with "captcha protection: ..." text when the
    // project has Turnstile enabled but no token (or an invalid token)
    // arrives. Surface this as a distinct code so the panel can pop the
    // Turnstile widget instead of showing the generic error.
    if (res.status === 400 && /captcha/i.test(detail)) {
      const err = new Error('Captcha required for anonymous signup');
      err.code = 'CAPTCHA_REQUIRED';
      throw err;
    }
    throw new Error(
      `Anonymous signup failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
  }
  const json = await res.json();
  if (!json?.access_token || !json?.user?.id) {
    throw new Error('Anonymous signup returned an unexpected shape');
  }
  return json;
}

/**
 * Renew the hosted session by retrying anonSignup with a captcha token.
 * Called by the SW message handler that owns the launchWebAuthFlow user
 * gesture — the token is obtained inside that handler and passed in here
 * so this layer doesn't have to know about chrome.identity.
 *
 * @returns {Promise<{accessToken:string,subjectId:string}>}
 */
export async function completeHostedSignupWithCaptcha(settings, captchaToken) {
  const authUrl = deriveAuthUrl(settings.hostedBaseUrl);
  const anonKey = settings.hostedAnonKey;
  if (!authUrl || !anonKey) {
    throw new Error('Hosted auth misconfigured: missing base URL or anon key');
  }
  await assertHostedPermission(settings);
  const signup = await anonSignup(authUrl, anonKey, captchaToken);
  await applySession(settings, { ...signup, isAnonymous: true, email: '' });
  return { accessToken: signup.access_token, subjectId: signup.user.id };
}

async function exchangeRefreshToken(authUrl, anonKey, refreshToken) {
  const res = await fetch(`${authUrl}/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Token refresh failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
  }
  const json = await res.json();
  if (!json?.access_token || !json?.user?.id) {
    throw new Error('Token refresh returned an unexpected shape');
  }
  return json;
}

async function fetchAuthUser(authUrl, anonKey, accessToken) {
  const res = await fetch(`${authUrl}/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`auth/v1/user failed (${res.status})`);
  }
  const user = await res.json();
  if (!user?.id) throw new Error('auth/v1/user returned no id');
  return user;
}

// hostedBaseUrl is the /functions/v1 path; the auth root is /auth/v1 on the
// same origin. Strip the trailing /functions/v1 and append /auth/v1.
function deriveAuthUrl(hostedBaseUrl) {
  if (!hostedBaseUrl) return '';
  try {
    const u = new URL(hostedBaseUrl);
    return `${u.origin}/auth/v1`;
  } catch {
    return '';
  }
}

// Test seam: helper for test code that wants to load settings fresh without
// the caller importing settings.js separately.
export async function _getSettings() {
  return getSettings();
}
