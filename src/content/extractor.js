import { Readability, isProbablyReaderable } from '@mozilla/readability';

const MIN_TEXT_LENGTH = 200;
// Cap the article we send to the model so a runaway page (forums, infinite-scroll,
// duplicated nav) doesn't blow the prompt up and stall the call.
const MAX_TEXT_LENGTH = 60000;

export function extractPage() {
  if (!isProbablyReaderable(document, { minContentLength: MIN_TEXT_LENGTH })) {
    return tryFallback();
  }
  const clone = document.cloneNode(true);
  const article = new Readability(clone).parse();
  if (!article || (article.textContent?.length ?? 0) < MIN_TEXT_LENGTH) {
    return tryFallback();
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
  const main =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]');
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

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
