// Hosted community-summary read client. Public endpoints — no auth
// required, the anon key is sent so traffic is shaped the same as
// other hosted calls. Separate from hosted-share.js (writes) and
// hosted-client.js (SSE streams) so each module has one job.
//
// Used by the panel's quota-savings hook: before kicking off level 1-3
// generation, probe whether someone has already published a community
// version of the same URL. If yes, the panel offers "Use latest"
// (hydrate from the published payload, zero quota cost) as an
// alternative to a fresh generate call.

import { assertHostedPermission } from './hosted-client.js';

export class CommunityReadError extends Error {
  constructor({ code, message }) {
    super(message ?? code ?? 'Community fetch failed');
    this.name = 'CommunityReadError';
    this.code = code ?? 'UPSTREAM_FAILED';
  }
}

function buildHeaders(settings) {
  const headers = { accept: 'application/json' };
  if (settings.hostedAnonKey) headers.apikey = settings.hostedAnonKey;
  // Some Supabase gateway configurations require Authorization too —
  // sending the anon key in both slots matches the marketing site's
  // api.js helper so behavior is consistent across surfaces.
  if (settings.hostedAccessToken) {
    headers.authorization = `Bearer ${settings.hostedAccessToken}`;
  } else if (settings.hostedAnonKey) {
    headers.authorization = `Bearer ${settings.hostedAnonKey}`;
  }
  return headers;
}

/**
 * List recent published versions for a URL. Returns an empty array on
 * network failure so the panel can fall through to normal generation
 * without surfacing a probe error.
 *
 * @returns {Promise<Array<{ slug, title, createdAt, viewCount }>>}
 */
export async function listCommunityVersions(settings, url) {
  if (!url) return [];
  await assertHostedPermission(settings);
  const baseUrl = (settings.hostedBaseUrl ?? '').replace(/\/+$/, '');
  const qs = new URLSearchParams({ url }).toString();
  try {
    const res = await fetch(`${baseUrl}/community-summary?${qs}`, {
      method: 'GET',
      headers: buildHeaders(settings),
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    return Array.isArray(json?.versions) ? json.versions : [];
  } catch (err) {
    console.warn('[hosted-community] list probe failed:', err?.message);
    return [];
  }
}

/**
 * Fetch a published summary by slug. Returns null on 404 or network
 * failure; the panel surfaces that to the user (e.g. "version no
 * longer available — generating fresh") rather than throwing.
 *
 * @returns {Promise<{ slug, url, title, payload, createdAt, viewCount } | null>}
 */
export async function fetchCommunitySummaryBySlug(settings, slug) {
  if (!slug) return null;
  await assertHostedPermission(settings);
  const baseUrl = (settings.hostedBaseUrl ?? '').replace(/\/+$/, '');
  try {
    const res = await fetch(`${baseUrl}/community-summary/${encodeURIComponent(slug)}`, {
      method: 'GET',
      headers: buildHeaders(settings),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[hosted-community] fetch-by-slug failed:', err?.message);
    return null;
  }
}
