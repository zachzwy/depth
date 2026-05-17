import { streamMessage } from './api.js';
import contentScriptPath from '../content/content-script.js?script&module';
import { getCached, setCached, clearCached } from './cache.js';
import { getSettings, isGenerationConfigured, providerFingerprint, hasConsentedToProvider } from '../lib/settings.js';
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
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScriptPath] });
    return true;
  } catch {
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
  // 3. Give the freshly injected script a moment to register its listener.
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 80));
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stripJsonWrapper(text) {
  if (!text) return text;
  let s = text.trim();
  // Strip ```json ... ``` or ``` ... ``` fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // Find first { and last } as a last resort
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
}

function makeAbort(port) {
  const controller = new AbortController();
  let aborted = false;
  port.onDisconnect.addListener(() => {
    aborted = true;
    controller.abort();
  });
  return { controller, getAborted: () => aborted };
}

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
      let lastData = null;
      const fullText = await streamMessage({
        settings,
        system: SYSTEM_1_3,
        messages: buildUserMessage1_3({ title, url, text }),
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
      console.error('[Depth] handleGenerate error:', err);
      if (!getAborted()) {
        safePost(port, { type: 'error', code: 'API_ERROR', message: String(err.message) });
      }
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
    let lastData = null;
    try {
      await streamMessage({
        settings,
        system: SYSTEM_QUIZ,
        messages: buildUserMessageQuiz({ title, url, text, keyTerms }),
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
      if (!getAborted()) safePost(port, { type: 'error', code: 'API_ERROR', message: String(err.message) });
    }
  });
}

// ----- Level 5: Deep Dive, multi-turn, not cached -----
function handleDive(port) {
  const { controller, getAborted } = makeAbort(port);
  let context = null; // { title, system, settings }

  port.onMessage.addListener(async (msg) => {
    if (msg?.type === 'start') {
      const settings = await getSettings();
      if (!isGenerationConfigured(settings)) return safePost(port, { type: 'error', code: 'NO_API_KEY' });
      if (!hasConsentedToProvider(settings)) return safePost(port, { type: 'error', code: 'NO_PROVIDER_CONSENT' });
      context = {
        title: msg.title,
        settings,
        system: buildSystemDive({ title: msg.title, summary: msg.summary }),
      };
      if (msg.skipOpeningTurn) {
        // Restored session — context is set, but don't generate a fresh opening turn.
        safePost(port, { type: 'context-ready' });
        return;
      }
      streamTurn([{ role: 'user', content: 'Begin the dialog with your first probing question.' }]);
      return;
    }
    if (msg?.type === 'turn') {
      if (!context) return safePost(port, { type: 'error', code: 'NO_CONTEXT' });
      const apiMessages = msg.history
        .map((t) => ({ role: t.role, content: t.content }))
        .filter((m) => m.content && m.content.trim().length > 0);
      // If the first real assistant turn was seeded synthetically, replay its seed.
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
      if (!getAborted()) safePost(port, { type: 'error', code: 'API_ERROR', message: String(err.message) });
    }
  }
}
