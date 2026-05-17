// Pure helpers extracted from service-worker.js so they can be unit tested
// directly. The SW still holds all the chrome.* and port wiring; these are
// just small functions that the handlers call.

/**
 * Map an internal Error message to one that's safe to surface in the panel
 * UI. Some message prefixes are already user-facing ("Model provider…",
 * "Permission for…", "Missing API key/model") — pass those through. Anything
 * else gets a generic fallback that doesn't leak provider-side details.
 */
export function publicApiErrorMessage(err) {
  const message = String(err?.message ?? '');
  if (message.startsWith('Model provider')) return message;
  if (message.startsWith('Permission for ')) return message;
  if (message.includes('Missing API key') || message.includes('Missing model')) return message;
  return 'The model provider request failed. Check your provider settings, API key, quota, and model name.';
}

/**
 * Fisher–Yates shuffle. Returns a new array; input is not mutated.
 * Used for dive's suggestedReplies so the same three options don't always
 * appear in the same order across turns.
 */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Best-effort fence + brace extraction for model output that arrived
 * wrapped in ```json fences or with extra preamble. Returns the trimmed
 * candidate JSON string; caller still has to JSON.parse it. Empty inputs
 * pass through unchanged so caller can decide whether to error.
 */
export function stripJsonWrapper(text) {
  if (!text) return text;
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
}

/**
 * Build an AbortController wired to a chrome.runtime port's onDisconnect.
 * Returns the controller plus a `getAborted` accessor for code paths that
 * want to short-circuit between awaits without checking signal.aborted.
 */
export function makeAbort(port) {
  const controller = new AbortController();
  let aborted = false;
  port.onDisconnect.addListener(() => {
    aborted = true;
    controller.abort();
  });
  return { controller, getAborted: () => aborted };
}
