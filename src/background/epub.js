import { readZipCentralDirectory, readZipEntry } from './zip.js';

const XHTML_MEDIA_TYPES = new Set([
  'application/xhtml+xml',
  'text/html',
]);

export async function extractEpubTextFromBytes(bytes) {
  const { bytes: data, entries } = readZipCentralDirectory(bytes);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const opfPath = await findPackagePath(data, byName);
  const opfEntry = byName.get(opfPath);
  if (!opfEntry) throw new Error('This EPUB does not contain a readable package file.');

  const opf = new TextDecoder().decode(await readZipEntry(data, opfEntry, { format: 'EPUB' }));
  const baseDir = dirname(opfPath);
  const manifest = parseManifest(opf);
  const spine = parseSpine(opf);
  const title = decodeXmlEntities(matchText(opf, /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i));
  const documents = spine
    .map((idref) => manifest.get(idref))
    .filter((item) => item && isReadableItem(item))
    .map((item) => ({ ...item, path: resolveZipPath(baseDir, item.href) }))
    .filter((item) => byName.has(item.path));

  const fallbackDocuments =
    documents.length > 0
      ? documents
      : [...manifest.values()]
          .filter(isReadableItem)
          .map((item) => ({ ...item, path: resolveZipPath(baseDir, item.href) }))
          .filter((item) => byName.has(item.path));

  if (fallbackDocuments.length === 0) {
    throw new Error('This EPUB does not contain readable XHTML chapters.');
  }

  const sections = [];
  for (const item of fallbackDocuments) {
    const html = new TextDecoder().decode(await readZipEntry(data, byName.get(item.path), { format: 'EPUB' }));
    const text = xhtmlToText(html);
    if (text) sections.push(text);
  }

  return {
    title: title || '',
    text: sections.join('\n\n').trim(),
    sectionCount: sections.length,
  };
}

export function xhtmlToText(html) {
  return decodeXmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(h[1-6]|p|div|section|article|li|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

async function findPackagePath(data, byName) {
  const containerEntry = byName.get('META-INF/container.xml');
  if (containerEntry) {
    const container = new TextDecoder().decode(await readZipEntry(data, containerEntry, { format: 'EPUB' }));
    const rootfile = container.match(/<rootfile\b[^>]*\bfull-path=(["'])(.*?)\1/i)?.[2];
    if (rootfile) return decodeXmlEntities(rootfile);
  }

  const opfEntry = [...byName.values()].find((entry) => /\.opf$/i.test(entry.name));
  if (opfEntry) return opfEntry.name;
  throw new Error('This EPUB does not contain a package manifest.');
}

function parseManifest(opf) {
  const manifest = new Map();
  for (const match of opf.matchAll(/<item\b([^>]*?)\/?>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (!attrs.id || !attrs.href) continue;
    manifest.set(attrs.id, {
      id: attrs.id,
      href: attrs.href,
      mediaType: attrs['media-type'] ?? '',
    });
  }
  return manifest;
}

function parseSpine(opf) {
  const out = [];
  for (const match of opf.matchAll(/<itemref\b([^>]*?)\/?>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (attrs.idref) out.push(attrs.idref);
  }
  return out;
}

function parseAttributes(source) {
  const attrs = {};
  for (const match of source.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
    attrs[match[1]] = decodeXmlEntities(match[3]);
  }
  return attrs;
}

function isReadableItem(item) {
  const mediaType = item.mediaType.toLowerCase();
  return XHTML_MEDIA_TYPES.has(mediaType) || /\.x?html?$/i.test(item.href);
}

function resolveZipPath(baseDir, href) {
  const cleanHref = href.split('#')[0].split('?')[0];
  const decoded = decodeUriPath(cleanHref);
  const parts = `${baseDir}${decoded}`.split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function dirname(path) {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : `${path.slice(0, slash)}/`;
}

function decodeUriPath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function matchText(source, pattern) {
  return source.match(pattern)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
}

function decodeXmlEntities(text = '') {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
