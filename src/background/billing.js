// Billing flows for the Account section in options.html. Both calls hit
// depth-api Edge Functions that require a verified bearer token, return
// a Stripe-hosted URL, and we open that URL in a new tab. Stripe-side
// completion flows back through the webhook (server-side) and is picked
// up here on the next fetchWhoami() refresh.

import { ensureHostedSession } from './hosted-auth.js';

export class BillingError extends Error {
  constructor({ code, message, status }) {
    super(message ?? code ?? 'Billing request failed');
    this.name = 'BillingError';
    this.code = code ?? 'BILLING_FAILED';
    this.status = status;
  }
}

/**
 * Open the Stripe Checkout flow in a new tab. Caller must be signed in
 * with a non-anonymous Supabase session; checkout-for-anonymous-users
 * doesn't make sense (we'd have nothing to attach the subscription to
 * if the user clears storage before completing).
 *
 * @returns {Promise<{ url: string, sessionId: string }>}
 */
export async function openCheckout(settings) {
  if (settings.hostedIsAnonymous) {
    throw new BillingError({
      code: 'SIGNED_OUT',
      message: 'Sign in before upgrading to Pro.',
    });
  }
  // ensureHostedSession refreshes if expired.
  await ensureHostedSession(settings);
  const result = await postBilling(settings, 'billing-checkout', {
    email: settings.hostedEmail || undefined,
  });
  await chrome.tabs.create({ url: result.url });
  return result;
}

/**
 * Open the Stripe Customer Portal in a new tab. Requires the user to
 * already be a Stripe customer (i.e. has completed checkout at least
 * once). Server returns 409 if no customer yet — we surface that as
 * NEEDS_CHECKOUT.
 *
 * @returns {Promise<{ url: string }>}
 */
export async function openPortal(settings) {
  if (settings.hostedIsAnonymous) {
    throw new BillingError({
      code: 'SIGNED_OUT',
      message: 'Sign in before opening the billing portal.',
    });
  }
  await ensureHostedSession(settings);
  const result = await postBilling(settings, 'billing-portal', {}).catch((err) => {
    if (err instanceof BillingError && err.status === 409) {
      throw new BillingError({
        code: 'NEEDS_CHECKOUT',
        message: 'You have no active Stripe customer yet — start with Upgrade to Pro.',
        status: err.status,
      });
    }
    throw err;
  });
  await chrome.tabs.create({ url: result.url });
  return result;
}

async function postBilling(settings, fn, body) {
  const baseUrl = (settings.hostedBaseUrl ?? '').replace(/\/+$/, '');
  if (!baseUrl) throw new BillingError({ code: 'BAD_REQUEST', message: 'No hosted base URL set' });

  const res = await fetch(`${baseUrl}/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${settings.hostedAccessToken}`,
    },
    body: JSON.stringify(body ?? {}),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    throw new BillingError({
      code: json?.code ?? 'BILLING_FAILED',
      message: json?.message ?? `${fn} failed (${res.status})`,
      status: res.status,
    });
  }
  return json;
}
