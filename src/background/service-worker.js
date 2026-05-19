import { streamMessage } from './api.js';
import { streamHosted, HostedError } from './hosted-client.js';
import { ensureHostedSession, completeHostedSignupWithCaptcha, signInWithGoogle } from './hosted-auth.js';
import { openCheckout, BillingError } from './billing.js';
import {
  publishSummary as hostedPublishSummary,
  listMyShares as hostedListMyShares,
  deleteMyShare as hostedDeleteMyShare,
  ShareError,
} from './hosted-share.js';
import {
  listCommunityVersions,
  fetchCommunitySummaryBySlug,
} from './hosted-community.js';
import { extractPdfDocument } from './pdf.js';
import { publicApiErrorMessage, shuffle, stripJsonWrapper, makeAbort } from './helpers.js';
import contentScriptPath from '../content/content-script.js?script';
import { getCached, setCached, clearCached } from './cache.js';
import { getSettings, setSettings, isGenerationConfigured, providerFingerprint, hasConsentedToProvider } from '../lib/settings.js';
import { contentHash } from '../lib/content-hash.js';
import {
  SYSTEM_1_3,
  SYSTEM_QUIZ,
  buildUserMessage1_3,
  buildUserMessageQuiz,
  buildSystemDive,
  PROMPT_VERSION,
} from '../lib/prompts.js';

async function injectContentScript(tabId) {
  try {
    const file = contentScriptPath.startsWith('/') ? contentScriptPath.slice(1) : contentScriptPath;
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    return true;
  } catch (e) {
    console.warn('[Depth] could not inject content script:', e?.message);
    return false;
  }
}

async function trySendToggle(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'depth:toggle' });
    return true;
  } catch {
    return false;
  }
}

async function toggleActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    console.warn('[Depth] toggle skipped — restricted URL:', tab.url);
    return;
  }
  // 1. Try the existing content script (fast path).
  if (await trySendToggle(tab.id)) return;
  // 2. Inject and retry — script may have been orphaned by an extension reload.
  const ok = await injectContentScript(tab.id);
  if (!ok) {
    console.warn('[Depth] could not inject content script into tab', tab.id);
    return;
  }
  // 3. Give the freshly injected loader time to import the module and register.
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await trySendToggle(tab.id)) return;
  }
  console.warn('[Depth] could not reach content script after injection — try refreshing the page');
}

chrome.action.onClicked.addListener(toggleActiveTab);

chrome.commands.onCommand.addListener((command) => {
  if (command === 'depth-toggle') toggleActiveTab();
});

async function openOptionsPageRobust() {
  try {
    await chrome.runtime.openOptionsPage();
    console.log('[Depth] options page opened');
  } catch (e) {
    console.warn('[Depth] openOptionsPage failed, falling back to tabs.create:', e?.message);
    const optionsPath = chrome.runtime.getManifest().options_page;
    if (optionsPath) {
      const url = chrome.runtime.getURL(optionsPath);
      await chrome.tabs.create({ url });
    } else {
      console.error('[Depth] no options_page in manifest');
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'depth:open-options') {
    console.log('[Depth] received open-options');
    openOptionsPageRobust();
    return;
  }
  if (msg?.type === 'depth:open-checkout') {
    (async () => {
      // The panel runs in a content-script context and can't open a tab
      // directly — route through the SW. The billing helper handles the
      // anonymous-session refusal + the chrome.tabs.create(stripeUrl) step.
      try {
        const settings = await getSettings();
        const result = await openCheckout(settings);
        sendResponse({ ok: true, url: result.url });
      } catch (err) {
        const code = err instanceof BillingError ? err.code : 'BILLING_FAILED';
        sendResponse({ ok: false, code, message: err?.message ?? 'Checkout failed' });
      }
    })();
    return true;
  }
  if (msg?.type === 'depth:sign-in') {
    // Paywall "Sign in" click for anonymous users. chrome.identity isn't
    // available in content-script contexts, so the panel routes the click
    // through here and signInWithGoogle runs launchWebAuthFlow from the SW.
    (async () => {
      try {
        const settings = await getSettings();
        await signInWithGoogle(settings);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, code: 'SIGN_IN_FAILED', message: err?.message ?? 'Sign-in failed' });
      }
    })();
    return true;
  }
  if (msg?.type === 'depth:extract-document') {
    (async () => {
      try {
        const extracted = await extractPdfDocument({
          url: msg.url,
          title: msg.title,
        });
        sendResponse({ ok: true, extracted });
      } catch (err) {
        console.warn('[Depth] document extraction failed:', err?.message);
        sendResponse({
          ok: false,
          code: err?.code ?? 'PDF_EXTRACT_FAILED',
          message: err?.message ?? 'Could not read this PDF.',
        });
      }
    })();
    return true;
  }
  if (msg?.type === 'depth:request-hosted-permission') {
    // The user gesture from the panel button carries into this handler,
    // but ONLY for the synchronous portion. Any `await` before calling
    // chrome.permissions.request consumes the activation token and Chrome
    // will silently refuse without showing the dialog. The panel passes
    // `originPattern` in the message so we can call request() directly.
    const pattern = msg.originPattern;
    if (!pattern) {
      sendResponse({ granted: false, code: 'BAD_REQUEST', message: 'No origin pattern' });
      return;
    }
    chrome.permissions
      .request({ origins: [pattern] })
      .then((granted) => sendResponse({ granted }))
      .catch((err) =>
        sendResponse({
          granted: false,
          code: 'BAD_REQUEST',
          message: err?.message ?? 'Permission request failed',
        }),
      );
    return true;
  }
  if (msg?.type === 'depth:complete-captcha') {
    // Panel's "Verify" click bubbles in here. We do the launchWebAuthFlow
    // synchronously (no awaits in between) so the user-activation token
    // survives, then hand the token to completeHostedSignupWithCaptcha
    // which finishes the /signup call. On success the panel re-inits and
    // generation proceeds as if captcha was never in the way.
    //
    // The URL is built here (not in the panel) because chrome.identity
    // isn't available in content-script contexts. We read hostedBaseUrl
    // synchronously from a passed-in field if any, otherwise fall back
    // to chrome.storage — but storage access consumes the gesture, so
    // prefer passing it from the panel when possible.
    const redirect = chrome.identity?.getRedirectURL?.();
    if (!redirect) {
      sendResponse({
        ok: false,
        code: 'CAPTCHA_FAILED',
        message: 'chrome.identity unavailable — check the `identity` permission.',
      });
      return;
    }
    let baseUrl = (msg.hostedBaseUrl ?? '').replace(/\/+$/, '');
    if (!baseUrl) {
      // Fallback: read storage synchronously isn't possible, so the
      // gesture-preserving path is to receive the base URL from the
      // panel. The panel does pass it; this branch covers older callers.
      sendResponse({ ok: false, code: 'BAD_REQUEST', message: 'No hosted base URL' });
      return;
    }
    const captchaUrl = `${baseUrl}/captcha-page?redirect=${encodeURIComponent(redirect)}`;
    chrome.identity.launchWebAuthFlow(
      { url: captchaUrl, interactive: true },
      async (responseUrl) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          sendResponse({
            ok: false,
            code: 'CAPTCHA_FAILED',
            message: lastError.message || 'Captcha flow failed',
          });
          return;
        }
        if (!responseUrl) {
          sendResponse({ ok: false, code: 'CAPTCHA_FAILED', message: 'No response URL' });
          return;
        }
        try {
          const url = new URL(responseUrl);
          const frag = new URLSearchParams(url.hash.replace(/^#/, ''));
          const token = frag.get('token');
          const error = frag.get('error');
          if (error || !token) {
            sendResponse({
              ok: false,
              code: 'CAPTCHA_FAILED',
              message: error ?? 'No captcha token returned',
            });
            return;
          }
          const settings = await getSettings();
          await completeHostedSignupWithCaptcha(settings, token);
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({
            ok: false,
            code: 'CAPTCHA_FAILED',
            message: err?.message ?? 'Captcha signup failed',
          });
        }
      },
    );
    return true;
  }
  if (msg?.type === 'depth:share-summary') {
    // Publish the current panel snapshot to /community. The panel
    // builds the payload from cached level-1-3 data; we just forward
    // it to depth-api.
    //
    // We derive articleHash from the article text here rather than in
    // the panel because crypto.subtle is gated to secure contexts —
    // when the host page is http://, the content-script context has
    // no crypto.subtle and the hash would throw.
    (async () => {
      try {
        const settings = await getSettings();
        const { url, title, text, payload } = msg;
        const articleHash = await contentHash(title ?? '', text ?? '');
        const result = await hostedPublishSummary(settings, {
          url,
          title,
          articleHash,
          payload,
        });
        sendResponse({ ok: true, ...result });
      } catch (err) {
        const code =
          err instanceof ShareError
            ? err.code
            : err instanceof HostedError
              ? err.code
              : 'UPSTREAM_FAILED';
        sendResponse({
          ok: false,
          code,
          message: err?.message ?? 'Share failed',
          details: err?.details,
        });
      }
    })();
    return true;
  }
  if (msg?.type === 'depth:list-my-shares') {
    // Options page asks for the caller's own published summaries.
    // Auth/permission gates live in hosted-share.js; we just forward
    // the result or map errors into the standard {ok,code,message} shape.
    (async () => {
      try {
        const settings = await getSettings();
        const { versions } = await hostedListMyShares(settings);
        sendResponse({ ok: true, versions });
      } catch (err) {
        const code =
          err instanceof ShareError
            ? err.code
            : err instanceof HostedError
              ? err.code
              : 'UPSTREAM_FAILED';
        sendResponse({
          ok: false,
          code,
          message: err?.message ?? 'List failed',
          details: err?.details,
        });
      }
    })();
    return true;
  }
  if (msg?.type === 'depth:delete-my-share') {
    (async () => {
      try {
        const settings = await getSettings();
        await hostedDeleteMyShare(settings, msg.slug);
        sendResponse({ ok: true });
      } catch (err) {
        const code =
          err instanceof ShareError
            ? err.code
            : err instanceof HostedError
              ? err.code
              : 'UPSTREAM_FAILED';
        sendResponse({
          ok: false,
          code,
          message: err?.message ?? 'Delete failed',
          details: err?.details,
        });
      }
    })();
    return true;
  }
  if (msg?.type === 'depth:probe-community') {
    // Panel asks "are there published versions of this URL?" before
    // kicking off generation. Returns versions[] (may be empty) — we
    // intentionally swallow errors here so a probe failure doesn't
    // block the normal generation flow.
    (async () => {
      try {
        const settings = await getSettings();
        if (!settings.communityUseCache) {
          sendResponse({ versions: [] });
          return;
        }
        const versions = await listCommunityVersions(settings, msg.url ?? '');
        sendResponse({ versions });
      } catch (err) {
        console.warn('[Depth] probe-community failed:', err?.message);
        sendResponse({ versions: [] });
      }
    })();
    return true;
  }
  if (msg?.type === 'depth:open-options') {
    // Content scripts can't call chrome.runtime.openOptionsPage directly.
    chrome.runtime.openOptionsPage().catch((err) => {
      console.warn('[Depth] openOptionsPage failed:', err?.message);
    });
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === 'depth:fetch-community-summary') {
    // Panel asks for the full payload of a slug the user picked.
    // Returns {ok, slug, url, title, payload} or {ok:false, code, message}.
    (async () => {
      try {
        const settings = await getSettings();
        const row = await fetchCommunitySummaryBySlug(settings, msg.slug ?? '');
        if (!row) {
          sendResponse({ ok: false, code: 'NOT_FOUND', message: 'Version not found.' });
          return;
        }
        sendResponse({ ok: true, ...row });
      } catch (err) {
        sendResponse({
          ok: false,
          code: 'UPSTREAM_FAILED',
          message: err?.message ?? 'Could not fetch community version.',
        });
      }
    })();
    return true;
  }
  if (msg?.type === 'depth:probe-cache-13') {
    // Panel asks "do we already have a fresh local cache for this URL's
    // level-1-3 content?". If yes, the panel hydrates directly and
    // skips both the community probe and a generation round trip,
    // because the user has already paid for this article on this
    // device and the local cache hasn't expired.
    (async () => {
      try {
        const settings = await getSettings();
        const hash = await contentHash(
          msg.title ?? '',
          msg.text ?? '',
          providerFingerprint(settings),
          PROMPT_VERSION,
        );
        const cached = await getCached(hash, '1-3');
        sendResponse(cached ? { cached: true, data: cached } : { cached: false });
      } catch (e) {
        sendResponse({ cached: false, error: String(e?.message) });
      }
    })();
    return true;
  }
  if (msg?.type === 'depth:probe-quiz') {
    (async () => {
      try {
        const settings = await getSettings();
        const hash = await contentHash(msg.title, msg.text, providerFingerprint(settings), PROMPT_VERSION);
        const cached = await getCached(hash, 'quiz');
        sendResponse(cached ? { cached: true, data: cached } : { cached: false });
      } catch (e) {
        sendResponse({ cached: false, error: String(e?.message) });
      }
    })();
    return true; // keep the message channel open for the async sendResponse
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'depth-generate') return handleGenerate(port);
  if (port.name === 'depth-quiz') return handleQuiz(port);
  if (port.name === 'depth-dive') return handleDive(port);
});

function safePost(port, msg) {
  try {
    port.postMessage(msg);
  } catch (e) {
    console.warn('[Depth] safePost failed:', msg?.type, e?.message);
  }
}

// Pure helpers (publicApiErrorMessage, shuffle, stripJsonWrapper, makeAbort)
// live in ./helpers.js and are imported above.

// ----- Levels 1–3: combined call, cached -----
function handleGenerate(port) {
  const { controller, getAborted } = makeAbort(port);

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'start') return;
    try {
      const { title, url, text, force } = msg;
      console.log('[Depth] handleGenerate: textChars=' + text.length, force ? '(force)' : '');

      const settings = await getSettings();
      if (!isGenerationConfigured(settings)) return safePost(port, { type: 'error', code: 'NO_API_KEY' });
      if (!hasConsentedToProvider(settings)) return safePost(port, { type: 'error', code: 'NO_PROVIDER_CONSENT' });

      const hash = await contentHash(title, text, providerFingerprint(settings), PROMPT_VERSION);
      if (force) {
        await Promise.all([clearCached(hash, '1-3'), clearCached(hash, 'quiz')]);
      }
      const cached = force ? null : await getCached(hash, '1-3');
      if (cached) {
        console.log('[Depth] cache hit');
        return safePost(port, { type: 'done', data: cached, fromCache: true, hash });
      }

      safePost(port, { type: 'started', hash });

      if (settings.providerMode === 'hosted') {
        await ensureHostedSession(settings);
        const { data } = await streamHosted({
          kind: 'generate',
          settings,
          body: { title, url, text, preferredLanguage: settings.preferredLanguage },
          signal: controller.signal,
          onPartial: (data) => {
            if (getAborted()) return;
            safePost(port, { type: 'partial', data });
          },
        });
        if (!getAborted() && data) {
          await setCached(hash, data, '1-3');
          safePost(port, { type: 'done', data, hash });
        }
        return;
      }

      let lastData = null;
      const fullText = await streamMessage({
        settings,
        system: SYSTEM_1_3,
        messages: buildUserMessage1_3({ title, url, text, preferredLanguage: settings.preferredLanguage }),
        signal: controller.signal,
        onPartial: (data) => {
          if (getAborted()) return;
          lastData = data;
          safePost(port, { type: 'partial', data });
        },
      });
      console.log('[Depth] handleGenerate done', {
        aborted: getAborted(),
        lastDataKeys: lastData ? Object.keys(lastData) : null,
        fullTextLen: fullText?.length,
      });
      if (!getAborted() && lastData) {
        await setCached(hash, lastData, '1-3');
        safePost(port, { type: 'done', data: lastData, hash });
        console.log('[Depth] posted done');
      } else if (!getAborted()) {
        // Final fallback: try to parse fullText one more time, stripping common wrappers.
        const cleaned = stripJsonWrapper(fullText);
        try {
          const parsed = JSON.parse(cleaned);
          await setCached(hash, parsed, '1-3');
          safePost(port, { type: 'done', data: parsed, hash });
          console.log('[Depth] posted done (fallback parse)');
        } catch (e) {
          safePost(port, { type: 'error', code: 'EMPTY_RESPONSE', message: 'Could not parse model output as JSON. First 200 chars: ' + (fullText ?? '').slice(0, 200) });
          console.log('[Depth] posted error EMPTY_RESPONSE');
        }
      }
    } catch (err) {
      console.warn('[Depth] handleGenerate error:', err?.message);
      if (getAborted()) return;
      if (err instanceof HostedError) {
        safePost(port, {
          type: 'error',
          code: err.code,
          message: err.message,
          upgradeUrl: err.upgradeUrl,
        });
        return;
      }
      safePost(port, { type: 'error', code: 'API_ERROR', message: publicApiErrorMessage(err) });
    }
  });
}

// ----- Level 4: Quiz, cached -----
function handleQuiz(port) {
  const { controller, getAborted } = makeAbort(port);

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'start') return;
    const { title, url, text, keyTerms } = msg;
    const settings = await getSettings();
    if (!isGenerationConfigured(settings)) return safePost(port, { type: 'error', code: 'NO_API_KEY' });
    if (!hasConsentedToProvider(settings)) return safePost(port, { type: 'error', code: 'NO_PROVIDER_CONSENT' });

    const hash = await contentHash(title, text, providerFingerprint(settings), PROMPT_VERSION);
    const cached = await getCached(hash, 'quiz');
    if (cached) {
      return safePost(port, { type: 'done', data: cached, fromCache: true });
    }

    safePost(port, { type: 'started' });
    try {
      if (settings.providerMode === 'hosted') {
        await ensureHostedSession(settings);
        const { data } = await streamHosted({
          kind: 'quiz',
          settings,
          body: { title, url, text, keyTerms, preferredLanguage: settings.preferredLanguage },
          signal: controller.signal,
          onPartial: (data) => {
            if (getAborted()) return;
            safePost(port, { type: 'partial', data });
          },
        });
        if (!getAborted() && data) {
          await setCached(hash, data, 'quiz');
          safePost(port, { type: 'done', data });
        }
        return;
      }

      let lastData = null;
      await streamMessage({
        settings,
        system: SYSTEM_QUIZ,
        messages: buildUserMessageQuiz({ title, url, text, keyTerms, preferredLanguage: settings.preferredLanguage }),
        maxTokens: 3000,
        signal: controller.signal,
        onPartial: (data) => {
          if (getAborted()) return;
          lastData = data;
          safePost(port, { type: 'partial', data });
        },
      });
      if (!getAborted() && lastData) {
        await setCached(hash, lastData, 'quiz');
        safePost(port, { type: 'done', data: lastData });
      } else if (!getAborted()) {
        safePost(port, { type: 'error', code: 'EMPTY_RESPONSE' });
      }
    } catch (err) {
      console.warn('[Depth] handleQuiz error:', err?.message);
      if (getAborted()) return;
      if (err instanceof HostedError) {
        safePost(port, {
          type: 'error',
          code: err.code,
          message: err.message,
          upgradeUrl: err.upgradeUrl,
        });
        return;
      }
      safePost(port, { type: 'error', code: 'API_ERROR', message: publicApiErrorMessage(err) });
    }
  });
}

// ----- Level 5: Deep Dive, multi-turn, not cached -----
function handleDive(port) {
  const { controller, getAborted } = makeAbort(port);
  // BYOK keeps a server-style chat: a precomputed `system` prompt + the
  // running message list. Hosted keeps only the grounding (title + summary)
  // because the backend is stateless and rebuilds the prompt per turn.
  let context = null; // { settings, title, summary, system? }

  port.onMessage.addListener(async (msg) => {
    if (msg?.type === 'start') {
      const settings = await getSettings();
      if (!isGenerationConfigured(settings)) return safePost(port, { type: 'error', code: 'NO_API_KEY' });
      if (!hasConsentedToProvider(settings)) return safePost(port, { type: 'error', code: 'NO_PROVIDER_CONSENT' });
      context = {
        settings,
        title: msg.title,
        url: msg.url,
        summary: msg.summary,
        system:
          settings.providerMode === 'hosted'
            ? null
            : buildSystemDive({
                title: msg.title,
                summary: msg.summary,
                preferredLanguage: settings.preferredLanguage,
              }),
      };
      if (msg.skipOpeningTurn) {
        // Restored session — context is set, but don't generate a fresh opening turn.
        safePost(port, { type: 'context-ready' });
        return;
      }
      if (settings.providerMode === 'hosted') {
        streamHostedTurn([]);
      } else {
        streamTurn([{ role: 'user', content: 'Begin the dialog with your first probing question.' }]);
      }
      return;
    }
    if (msg?.type === 'turn') {
      if (!context) return safePost(port, { type: 'error', code: 'NO_CONTEXT' });
      const apiMessages = msg.history
        .map((t) => ({ role: t.role, content: t.content }))
        .filter((m) => m.content && m.content.trim().length > 0);

      if (context.settings.providerMode === 'hosted') {
        // Hosted: server is stateless and handles seeding. Send the visible
        // history as-is.
        streamHostedTurn(apiMessages);
        return;
      }

      // BYOK: OpenAI-style chat can't start with an assistant turn. Replay
      // the synthetic seed if the first message is an assistant turn.
      if (apiMessages[0]?.role === 'assistant') {
        apiMessages.unshift({
          role: 'user',
          content: 'Begin the dialog with your first probing question.',
        });
      }
      streamTurn(apiMessages);
    }
  });

  async function streamTurn(apiMessages) {
    safePost(port, { type: 'turn-started' });
    let lastData = null;
    try {
      await streamMessage({
        settings: context.settings,
        system: context.system,
        messages: apiMessages,
        maxTokens: 800,
        signal: controller.signal,
        onPartial: (data) => {
          if (getAborted()) return;
          lastData = data;
          safePost(port, { type: 'partial-turn', data });
        },
      });
      if (!getAborted() && lastData) {
        const finalData = {
          ...lastData,
          suggestedReplies: shuffle(lastData.suggestedReplies ?? []),
        };
        safePost(port, { type: 'turn-done', data: finalData });
      } else if (!getAborted()) {
        safePost(port, { type: 'error', code: 'EMPTY_RESPONSE' });
      }
    } catch (err) {
      console.warn('[Depth] handleDive error:', err?.message);
      if (!getAborted()) safePost(port, { type: 'error', code: 'API_ERROR', message: publicApiErrorMessage(err) });
    }
  }

  async function streamHostedTurn(messages) {
    safePost(port, { type: 'turn-started' });
    try {
      await ensureHostedSession(context.settings);
      const { data } = await streamHosted({
        kind: 'dive',
        settings: context.settings,
        body: {
          title: context.title,
          url: context.url,
          summary: context.summary,
          messages,
          preferredLanguage: context.settings.preferredLanguage,
        },
        signal: controller.signal,
        onPartial: (data) => {
          if (getAborted()) return;
          safePost(port, { type: 'partial-turn', data });
        },
      });
      if (!getAborted() && data) {
        const finalData = {
          ...data,
          suggestedReplies: shuffle(data.suggestedReplies ?? []),
        };
        safePost(port, { type: 'turn-done', data: finalData });
      }
    } catch (err) {
      console.warn('[Depth] handleDive hosted error:', err?.message);
      if (getAborted()) return;
      if (err instanceof HostedError) {
        safePost(port, {
          type: 'error',
          code: err.code,
          message: err.message,
          upgradeUrl: err.upgradeUrl,
        });
        return;
      }
      safePost(port, { type: 'error', code: 'API_ERROR', message: publicApiErrorMessage(err) });
    }
  }
}
