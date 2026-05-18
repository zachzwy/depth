import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openCheckout, openPortal, BillingError } from '../../src/background/billing.js';
import { setSettings, getSettings } from '../../src/lib/settings.js';

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const HOSTED_BASE = 'http://localhost:54321/functions/v1';

async function signedInSettings(overrides = {}) {
  const futureExp = Date.now() + 30 * 60 * 1000;
  await setSettings({
    providerMode: 'hosted',
    hostedBaseUrl: HOSTED_BASE,
    hostedAnonKey: 'anon-key',
    hostedAccessToken: 'permanent-at',
    hostedRefreshToken: 'permanent-rt',
    hostedAccessTokenExpiresAt: futureExp,
    hostedSubjectId: 'user-1',
    hostedIsAnonymous: false,
    hostedEmail: 'a@b.co',
    ...overrides,
  });
  return getSettings();
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
  chrome.permissions._grant('http://localhost:54321/*');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openCheckout', () => {
  it('refuses when the user is anonymous', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: 'anon-key',
      hostedIsAnonymous: true,
    });
    const settings = await getSettings();
    await expect(openCheckout(settings)).rejects.toThrow(BillingError);
    await expect(openCheckout(settings)).rejects.toMatchObject({ code: 'SIGNED_OUT' });
  });

  it('posts to /billing-checkout and opens the URL in a new tab', async () => {
    const settings = await signedInSettings();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ url: 'https://checkout.stripe.com/cs_1', sessionId: 'cs_1' }),
    );

    const result = await openCheckout(settings);
    expect(result.url).toBe('https://checkout.stripe.com/cs_1');

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${HOSTED_BASE}/billing-checkout`);
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer permanent-at');
    expect(JSON.parse(init.body).email).toBe('a@b.co');

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://checkout.stripe.com/cs_1',
    });
  });

  it('skips the email field when no email is on file', async () => {
    const settings = await signedInSettings({ hostedEmail: '' });
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ url: 'https://checkout.stripe.com/cs_1', sessionId: 'cs_1' }),
    );
    await openCheckout(settings);
    const init = globalThis.fetch.mock.calls[0][1];
    expect(JSON.parse(init.body).email).toBeUndefined();
  });

  it('surfaces server errors as BillingError with code preserved', async () => {
    const settings = await signedInSettings();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ code: 'BAD_REQUEST', message: 'invalid email' }, { status: 400 }),
    );
    await expect(openCheckout(settings)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'invalid email',
      status: 400,
    });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the response body is not JSON', async () => {
    const settings = await signedInSettings();
    globalThis.fetch.mockResolvedValueOnce(
      new Response('not json', { status: 500 }),
    );
    await expect(openCheckout(settings)).rejects.toMatchObject({
      code: 'BILLING_FAILED',
      status: 500,
    });
  });

  it('refuses when no hosted base URL is set (raised by ensureHostedSession upstream)', async () => {
    // ensureHostedSession is called before the base-URL guard in postBilling,
    // so the misconfig error surfaces from there. Either way, the user
    // doesn't end up with a tab open.
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: '',
      hostedAnonKey: '',
      hostedAccessToken: 'at',
      hostedRefreshToken: '',
      hostedAccessTokenExpiresAt: Date.now() + 60_000,
      hostedSubjectId: 'user-1',
      hostedIsAnonymous: false,
    });
    const settings = await getSettings();
    await expect(openCheckout(settings)).rejects.toThrow(/misconfigured|hosted base URL/);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('refreshes a near-expired session before checkout', async () => {
    // hostedAccessToken still present but expiring soon → ensureHostedSession
    // refreshes first, then checkout.
    const settings = await signedInSettings({
      hostedAccessTokenExpiresAt: Date.now() - 60 * 1000, // expired
      hostedRefreshToken: 'permanent-rt',
    });
    globalThis.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'refreshed-at',
          refresh_token: 'permanent-rt-2',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: 'user-1' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ url: 'https://checkout.stripe.com/cs_2', sessionId: 'cs_2' }),
      );

    await openCheckout(settings);
    // Two fetches: refresh, then checkout — with refreshed bearer.
    expect(globalThis.fetch.mock.calls.length).toBe(2);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/auth/v1/token');
    expect(globalThis.fetch.mock.calls[1][0]).toBe(`${HOSTED_BASE}/billing-checkout`);
  });
});

describe('openPortal', () => {
  it('refuses when the user is anonymous', async () => {
    await setSettings({
      providerMode: 'hosted',
      hostedBaseUrl: HOSTED_BASE,
      hostedAnonKey: 'anon-key',
      hostedIsAnonymous: true,
    });
    const settings = await getSettings();
    await expect(openPortal(settings)).rejects.toMatchObject({ code: 'SIGNED_OUT' });
  });

  it('posts to /billing-portal and opens the URL', async () => {
    const settings = await signedInSettings();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ url: 'https://billing.stripe.com/p_1' }),
    );

    const result = await openPortal(settings);
    expect(result.url).toBe('https://billing.stripe.com/p_1');
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://billing.stripe.com/p_1' });
  });

  it('translates 409 into NEEDS_CHECKOUT', async () => {
    const settings = await signedInSettings();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ code: 'BAD_REQUEST', message: 'no customer' }, { status: 409 }),
    );
    await expect(openPortal(settings)).rejects.toMatchObject({
      code: 'NEEDS_CHECKOUT',
      status: 409,
    });
  });

  it('passes through non-409 errors unchanged', async () => {
    const settings = await signedInSettings();
    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ code: 'UPSTREAM_FAILED', message: 'stripe down' }, { status: 502 }),
    );
    await expect(openPortal(settings)).rejects.toMatchObject({
      code: 'UPSTREAM_FAILED',
      status: 502,
    });
  });
});

describe('BillingError', () => {
  it('exposes code and status fields', () => {
    const e = new BillingError({ code: 'X', message: 'y', status: 418 });
    expect(e.code).toBe('X');
    expect(e.status).toBe(418);
    expect(e.message).toBe('y');
  });

  it('defaults code and message when omitted', () => {
    const e = new BillingError({});
    expect(e.code).toBe('BILLING_FAILED');
    expect(e.message).toBe('Billing request failed');
  });
});
