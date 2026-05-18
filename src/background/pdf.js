import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { arxivHtmlCandidates, parseArxivId } from '../lib/document-sources.js';

const MIN_TEXT_LENGTH = 200;
const MAX_TEXT_LENGTH = 60000;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 50;

export async function extractPdfDocument({ url, title, signal } = {}) {
  if (!url) throw new Error('No PDF URL provided');

  for (const candidate of arxivHtmlCandidates(url)) {
    try {
      const htmlExtraction = await tryExtractHtml(candidate, { url, title, signal });
      if (htmlExtraction) return htmlExtraction;
    } catch (err) {
      console.warn('[Depth PDF] HTML candidate failed:', candidate.url, err?.message);
    }
  }

  return extractPdfText({ url, title, signal });
}

async function tryExtractHtml(candidate, { url, title, signal }) {
  const res = await fetch(candidate.url, {
    signal,
    headers: { accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const pageTitle = decodeHtml(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim(),
  );
  const text = htmlToText(html);
  if (text.length < MIN_TEXT_LENGTH) return null;
  const capped = capText(text);
  return {
    title: pageTitle || titleFromUrl(url, title),
    byline: null,
    siteName: 'arXiv',
    text: capped.text,
    wordCount: countWords(capped.text),
    truncated: capped.truncated,
    sourceUrl: candidate.url,
    sourceLabel: candidate.label,
    classification: { kind: 'article', sourceType: 'pdf-html' },
  };
}

async function extractPdfText({ url, title, signal }) {
  const res = await fetch(url, {
    signal,
    headers: { accept: 'application/pdf,*/*' },
  });
  if (!res.ok) {
    throw new Error(`PDF fetch failed (${res.status})`);
  }

  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_PDF_BYTES) {
    throw new Error('PDF is too large for this version of Depth');
  }

  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error('PDF is too large for this version of Depth');
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pagesToRead = Math.min(pageCount, MAX_PDF_PAGES);
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ includeMarkedContent: false });
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) pageTexts.push({ page: pageNumber, text: pageText });
  }

  const fullText = pageTexts.map((p) => p.text).join('\n\n').trim();
  if (fullText.length < MIN_TEXT_LENGTH) {
    throw new Error('This PDF does not expose enough selectable text. OCR is not supported yet.');
  }

  const capped = capText(fullText);
  return {
    title: titleFromUrl(url, title),
    byline: null,
    siteName: null,
    text: capped.text,
    wordCount: countWords(capped.text),
    truncated: capped.truncated || pageCount > pagesToRead,
    pageCount,
    pagesRead: pagesToRead,
    sourceUrl: url,
    sourceLabel: 'PDF text',
    classification: { kind: 'article', sourceType: 'pdf' },
  };
}

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function decodeHtml(text = '') {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function capText(text) {
  return {
    text: text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text,
    truncated: text.length > MAX_TEXT_LENGTH,
  };
}

function titleFromUrl(url, fallback) {
  if (fallback?.trim()) return fallback.trim();
  const id = parseArxivId(url);
  if (id) return `arXiv:${id}`;
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || parsed.host);
  } catch {
    return 'PDF document';
  }
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
