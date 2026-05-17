// Lazy anonymous Supabase Auth for the hosted backend.
//
// On the first hosted call (or after the access token's expiry), POSTs
// `/auth/v1/signup` with no email/password — Supabase returns an anonymous
// session whose access_token we send as `Authorization: Bearer` from then
// on. The token is persisted in chrome.storage.local so the same anonymous
// identity carries across service-worker restarts and browser sessions.
//
// Why a custom client instead of @supabase/supabase-js: the SDK is ~100 KB
// and pulls in fetch polyfills the extension doesn't need. One POST + one
// JSON.parse covers what we use.

import { setSettings } from '../lib/settings.js';

// Refresh slightly before exp to avoid edge-of-window failures.
const EXPIRY_SAFETY_MARGIN_MS = 60 * 1000;

/**
 * Ensure the supplied settings object carries a non-expired hosted access
 * token. May mutate `settings` in place (so callers using the returned
 * settings reference observe the new token immediately) AND persist via
 * chrome.storage.local.
 *
 * @returns {Promise<{ accessToken: string, subjectId: string }>}
 * @throws if the signup call fails — caller surfaces as a HostedError.
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

  const res = await fetch(`${authUrl}/signup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: anonKey,
    },
    body: JSON.stringify({ data: {} }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Anonymous signup failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
  }
  const json = await res.json();
  const accessToken = json?.access_token;
  const subjectId = json?.user?.id;
  // Supabase returns expires_at in seconds since epoch, not ms.
  const expiresAtSec = typeof json?.expires_at === 'number' ? json.expires_at : 0;
  if (!accessToken || !subjectId || !expiresAtSec) {
    throw new Error('Anonymous signup returned an unexpected shape');
  }

  const expiresAtMs = expiresAtSec * 1000;
  settings.hostedAccessToken = accessToken;
  settings.hostedAccessTokenExpiresAt = expiresAtMs;
  settings.hostedSubjectId = subjectId;

  await setSettings({
    hostedAccessToken: accessToken,
    hostedAccessTokenExpiresAt: expiresAtMs,
    hostedSubjectId: subjectId,
  });

  return { accessToken, subjectId };
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
