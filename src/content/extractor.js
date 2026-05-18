import { Readability, isProbablyReaderable } from '@mozilla/readability';

const MIN_TEXT_LENGTH = 200;
// Cap the article we send to the model so a runaway page (forums, infinite-scroll,
// duplicated nav) doesn't blow the prompt up and stall the call.
const MAX_TEXT_LENGTH = 60000;

export function extractPage() {
  const url = typeof location !== 'undefined' ? location.href : '';
  const urlVerdict = classifyByUrl(url);
  const extraction = tryReadability() ?? tryFallback();

  let kind;
  if (urlVerdict) kind = urlVerdict;
  else if (extraction) kind = 'article';
  else kind = 'unsupported';

  if (extraction) {
    return { ...extraction, classification: { kind } };
  }
  // No extractable text. Still return a stub so the refusal UI can render
  // with the page title and URL intact.
  return {
    title: typeof document !== 'undefined' ? document.title : '',
    byline: null,
    siteName: null,
    text: '',
    wordCount: 0,
    truncated: false,
    classification: { kind },
  };
}

function tryReadability() {
  if (typeof document === 'undefined') return null;
  if (!isProbablyReaderable(document, { minContentLength: MIN_TEXT_LENGTH })) {
    return null;
  }
  const clone = document.cloneNode(true);
  const article = new Readability(clone).parse();
  if (!article || (article.textContent?.length ?? 0) < MIN_TEXT_LENGTH) {
    return null;
  }
  const fullText = article.textContent.trim();
  const text = fullText.length > MAX_TEXT_LENGTH ? fullText.slice(0, MAX_TEXT_LENGTH) : fullText;
  return {
    title: article.title || document.title,
    byline: article.byline ?? null,
    siteName: article.siteName ?? null,
    text,
    wordCount: countWords(text),
    truncated: fullText.length > MAX_TEXT_LENGTH,
  };
}

function tryFallback() {
  if (typeof document === 'undefined') return null;
  const main = findFallbackContainer();
  if (!main) return null;
  const fullText = main.innerText.trim();
  if (fullText.length < MIN_TEXT_LENGTH) return null;
  const text = fullText.length > MAX_TEXT_LENGTH ? fullText.slice(0, MAX_TEXT_LENGTH) : fullText;
  return {
    title: document.title,
    byline: null,
    siteName: null,
    text,
    wordCount: countWords(text),
    truncated: fullText.length > MAX_TEXT_LENGTH,
  };
}

function findFallbackContainer() {
  const semantic =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]');
  if (semantic) return semantic;

  const selectors = [
    '#content-area',
    '#content-container',
    '#body-content',
    '[data-pagefind-body]',
    '.prose',
    '.markdown-body',
  ];

  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector))
      .filter(isReadableContainer)
      .sort((a, b) => a.innerText.length - b.innerText.length);
    if (candidates[0]) return candidates[0];
  }

  return null;
}

function isReadableContainer(el) {
  const text = el.innerText?.trim() ?? '';
  if (text.length < MIN_TEXT_LENGTH) return false;
  if (!el.querySelector('h1, h2, h3')) return false;
  if (el.matches('nav, aside, footer, header')) return false;
  return true;
}

// URL-only classification. Returns 'feed' | 'discussion' | null.
// Conservative on purpose: only sites where the page shape is unambiguous.
// Anything not matched falls through to Readability and is treated as an
// article on success or unsupported on failure.
export function classifyByUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname || '/';

  if (DISCUSSION_RULES.some((rule) => rule(host, path))) return 'discussion';
  if (FEED_RULES.some((rule) => rule(host, path))) return 'feed';
  return null;
}

const DISCUSSION_RULES = [
  (host, path) => host === 'news.ycombinator.com' && /^\/item\b/.test(path),
  (host, path) =>
    (host === 'reddit.com' || host === 'old.reddit.com') && /\/comments\//.test(path),
  (host, path) => host === 'github.com' && /\/(issues|pull)\/\d+/.test(path),
  (host, path) => host === 'stackoverflow.com' && /\/questions\/\d+/.test(path),
];

const FEED_RULES = [
  // Pure feed/social hosts — any path on these is a feed for our purposes.
  (host) => host === 'twitter.com' || host === 'x.com',
  (host) => host === 'bsky.app' || host === 'threads.net',
  // HN front, newest, etc. Item pages already matched by discussion rule above.
  (host, path) =>
    host === 'news.ycombinator.com' && /^\/(news|newest|front|best|active|ask|show|jobs)?\/?$/.test(path),
  // Reddit roots and subreddit roots (anything not /comments/, already excluded above).
  (host, path) => host === 'reddit.com' && /^\/(r\/[^/]+\/?)?$/.test(path),
];

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
