import { readZipCentralDirectory, readZipEntry } from './zip.js';

export async function extractDocxTextFromBytes(bytes) {
  const { bytes: data, entries } = readZipCentralDirectory(bytes);
  const documentEntry = entries.find((entry) => entry.name === 'word/document.xml');
  if (!documentEntry) {
    throw new Error('This DOCX does not contain readable document text.');
  }

  const parts = [documentEntry, ...entries.filter((entry) => /word\/(footnotes|endnotes)\.xml$/i.test(entry.name))];
  const texts = [];
  for (const entry of parts) {
    const xmlBytes = await readZipEntry(data, entry, { format: 'DOCX' });
    const xml = new TextDecoder().decode(xmlBytes);
    const text = docxXmlToText(xml);
    if (text) texts.push(text);
  }

  return texts.join('\n\n').trim();
}

export function docxXmlToText(xml) {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\s*\/>/gi, '\t')
      .replace(/<w:br\b[^>]*\/>/gi, '\n')
      .replace(/<\/w:tc>/gi, '\t')
      .replace(/<\/w:p>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

function decodeXmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
