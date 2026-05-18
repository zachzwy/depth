import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { extractDocxTextFromBytes } from './docx.js';
import {
  arxivHtmlCandidates,
  googleDocTextCandidates,
  parseArxivId,
  parseGoogleDoc,
  wordDocxCandidates,
} from '../lib/document-sources.js';

const MIN_TEXT_LENGTH = 200;
const MAX_TEXT_LENGTH = 60000;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 50;
const MAX_DOCX_BYTES = 20 * 1024 * 1024;

export async function extractPdfDocument({ url, title, signal } = {}) {
  if (!url) throw new Error('No PDF URL provided');

  if (parseGoogleDoc(url)) {
    return extractGoogleDocText({ url, title, signal });
  }

  const wordCandidates = wordDocxCandidates(url);
  if (wordCandidates.length > 0) {
    return extractDocxDocument({ url, title, signal, candidates: wordCandidates });
  }

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

async function extractGoogleDocText({ url, title, signal }) {
  for (const candidate of googleDocTextCandidates(url)) {
    const res = await fetch(candidate.url, {
      signal,
      credentials: 'include',
      headers: { accept: 'text/plain,*/*' },
    });
    if (!res.ok) {
      throw new Error(`Google Docs export failed (${res.status})`);
    }
    const text = normalizeDocumentText(await res.text());
    if (text.length < MIN_TEXT_LENGTH) {
      throw new Error('This Google Doc does not expose enough readable text.');
    }
    const capped = capText(text);
    return {
      title: titleFromUrl(url, title, 'Google Doc'),
      byline: null,
      siteName: 'Google Docs',
      text: capped.text,
      wordCount: countWords(capped.text),
      truncated: capped.truncated,
      sourceUrl: candidate.url,
      sourceLabel: candidate.label,
      classification: { kind: 'article', sourceType: 'google-doc' },
    };
  }

  throw new Error('This Google Docs URL is not supported yet.');
}

async function extractDocxDocument({ url, title, signal, candidates }) {
  let lastError;
  for (const candidate of candidates) {
    try {
      const text = await fetchDocxText(candidate.url, signal);
      if (text.length < MIN_TEXT_LENGTH) {
        throw new Error('This Word document does not expose enough readable text.');
      }
      const capped = capText(text);
      return {
        title: titleFromUrl(url, title, 'Word document'),
        byline: null,
        siteName: null,
        text: capped.text,
        wordCount: countWords(capped.text),
        truncated: capped.truncated,
        sourceUrl: candidate.url,
        sourceLabel: candidate.label,
        classification: { kind: 'article', sourceType: 'word-docx' },
      };
    } catch (err) {
      lastError = err;
      console.warn('[Depth DOCX] candidate failed:', candidate.url, err?.message);
    }
  }
  throw lastError ?? new Error('This Word document is not supported yet.');
}

async function fetchDocxText(url, signal) {
  const res = await fetch(url, {
    signal,
    credentials: 'include',
    headers: {
      accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*',
    },
  });
  if (!res.ok) {
    throw new Error(`Word document fetch failed (${res.status})`);
  }

  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_DOCX_BYTES) {
    throw new Error('Word document is too large for this version of Depth');
  }

  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_DOCX_BYTES) {
    throw new Error('Word document is too large for this version of Depth');
  }

  return normalizeDocumentText(await extractDocxTextFromBytes(bytes));
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

  // MV3 service workers don't have a window/document for PDF.js to infer a
  // worker URL from. Register the worker module in-process so PDF.js can use
  // its fake-worker path without requiring GlobalWorkerOptions.workerSrc.
  globalThis.pdfjsWorker ??= pdfjsWorker;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
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

function normalizeDocumentText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function titleFromUrl(url, fallback, defaultTitle = 'PDF document') {
  if (fallback?.trim()) return fallback.trim();
  const id = parseArxivId(url);
  if (id) return `arXiv:${id}`;
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || parsed.host);
  } catch {
    return defaultTitle;
  }
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
