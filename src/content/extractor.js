import { Readability, isProbablyReaderable } from '@mozilla/readability';

const MIN_TEXT_LENGTH = 200;
const MIN_FALLBACK_SCORE = 7;
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
  // No article-shaped container. Keep local-only page text so the refusal UI
  // can explain that text exists, and "Try anyway" has something to send.
  const pageText = typeof document !== 'undefined' ? visibleText(document.body) : '';
  const hasPageText = pageText.length >= MIN_TEXT_LENGTH;
  const text = hasPageText
    ? (pageText.length > MAX_TEXT_LENGTH ? pageText.slice(0, MAX_TEXT_LENGTH) : pageText)
    : '';
  return {
    title: typeof document !== 'undefined' ? document.title : '',
    byline: null,
    siteName: null,
    text,
    wordCount: hasPageText ? countWords(text) : 0,
    truncated: pageText.length > MAX_TEXT_LENGTH,
    classification: { kind, reason: hasPageText ? 'text-not-article' : 'no-text' },
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
  const candidate = findFallbackContainer();
  if (!candidate) return null;
  const fullText = visibleText(candidate.el);
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
  const selectors = [
    ['article', 5],
    ['main', 4],
    ['[role="main"]', 4],
    ['#content-area', 3],
    ['#content-container', 3],
    ['#body-content', 3],
    ['[data-pagefind-body]', 3],
    ['.prose', 2],
    ['.markdown-body', 2],
  ];
  const seen = new Set();
  const candidates = [];

  for (const [selector, selectorScore] of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const scored = scoreReadableContainer(el, selectorScore);
      if (scored) candidates.push(scored);
    }
  }

  return candidates
    .filter((candidate) => candidate.score >= MIN_FALLBACK_SCORE)
    .sort((a, b) => b.score - a.score || a.textLength - b.textLength)[0] ?? null;
}

function scoreReadableContainer(el, selectorScore) {
  if (el.matches('nav, aside, footer, header')) return null;
  const text = visibleText(el);
  if (text.length < MIN_TEXT_LENGTH) return null;

  const linkText = Array.from(el.querySelectorAll('a'))
    .map((a) => visibleText(a))
    .join(' ');
  const linkDensity = linkText.length / text.length;
  if (linkDensity > 0.55) return null;

  const wordCount = countWords(text);
  const blockCount = el.querySelectorAll('p, li, blockquote, pre, table').length;
  const headingCount = el.querySelectorAll('h1, h2, h3').length;
  const controlCount = el.querySelectorAll('button, input, select, textarea').length;

  let score = selectorScore;
  if (text.length >= 600) score += 2;
  else score += 1;
  if (wordCount >= 100) score += 2;
  else if (wordCount >= 50) score += 1;
  if (el.querySelector('h1')) score += 3;
  else if (headingCount > 0) score += 1;
  if (blockCount >= 3) score += 2;
  else if (blockCount > 0) score += 1;
  if (el.querySelector('time, [datetime], [rel="author"], .byline')) score += 1;

  if (linkDensity > 0.35) score -= 4;
  else if (linkDensity > 0.2) score -= 2;
  if (controlCount > blockCount && linkDensity > 0.15) score -= 2;
  if (/^(skip to|search|navigation)\b/i.test(text)) score -= 1;

  return { el, score, textLength: text.length };
}

function visibleText(el) {
  return (el?.innerText ?? el?.textContent ?? '').replace(/\s+/g, ' ').trim();
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
