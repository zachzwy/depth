// Hosted community-share client. Plain JSON POST flow — unlike the
// generation endpoints, /share-summary doesn't stream, so it lives in
// its own file rather than next to streamHosted in hosted-client.js.
//
// Why a separate module: keeps the SSE path focused on streaming, and
// mirrors the billing.js pattern (token refresh → fetch → JSON).
//
// Authorization: requires a valid Supabase Auth session. The current
// anonymous-session-as-default policy means most users have *some*
// bearer to send; signed-out (no token at all) callers get refused at
// the SW layer before we get here.

import { ensureHostedSession } from './hosted-auth.js';
import { assertHostedPermission, HostedError } from './hosted-client.js';

export class ShareError extends Error {
  constructor({ code, message, details }) {
    super(message ?? code ?? 'Share request failed');
    this.name = 'ShareError';
    this.code = code ?? 'UPSTREAM_FAILED';
    this.details = details;
  }
}

/**
 * Publish a model-produced summary to /community.
 *
 * @param {object} settings - extension settings (mutated in place if a
 *   refresh-token exchange happens during ensureHostedSession).
 * @param {object} input - { url, title, articleHash, payload }
 * @returns {Promise<{ slug: string, shareUrl: string }>}
 */
export async function publishSummary(settings, input) {
  await assertHostedPermission(settings);
  await ensureHostedSession(settings);
  const baseUrl = (settings.hostedBaseUrl ?? '').replace(/\/+$/, '');

  let res;
  try {
    res = await fetch(`${baseUrl}/share-summary`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${settings.hostedAccessToken}`,
      },
      body: JSON.stringify(input),
    });
  } catch (err) {
    // Network-level failure: re-throw as a HostedError so the panel can
    // distinguish "couldn't reach the server" from "server said no".
    throw new HostedError({
      code: 'UPSTREAM_FAILED',
      message: err?.message ?? 'Network error reaching /share-summary',
    });
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    throw new ShareError({
      code: json?.code ?? 'UPSTREAM_FAILED',
      message: json?.message ?? `/share-summary failed (${res.status})`,
      details: json?.details,
    });
  }
  if (!json?.slug || !json?.shareUrl) {
    throw new ShareError({
      code: 'UPSTREAM_FAILED',
      message: 'Backend returned an unexpected response shape.',
    });
  }
  return { slug: json.slug, shareUrl: json.shareUrl };
}
