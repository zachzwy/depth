const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY = 0x02014b50;
const ZIP_LOCAL_FILE = 0x04034b50;

const MAX_ZIP_COMMENT = 0xffff;

export async function extractDocxTextFromBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const entries = readZipCentralDirectory(data);
  const documentEntry = entries.find((entry) => entry.name === 'word/document.xml');
  if (!documentEntry) {
    throw new Error('This DOCX does not contain readable document text.');
  }

  const parts = [documentEntry, ...entries.filter((entry) => /word\/(footnotes|endnotes)\.xml$/i.test(entry.name))];
  const texts = [];
  for (const entry of parts) {
    const xmlBytes = await readZipEntry(data, entry);
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

function readZipCentralDirectory(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) throw new Error('This file is not a valid DOCX archive.');

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const directoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries = [];
  let offset = directoryOffset;

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY) {
      throw new Error('This DOCX archive has an invalid central directory.');
    }

    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = data.slice(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder(flags & 0x800 ? 'utf-8' : undefined).decode(nameBytes);

    entries.push({
      name,
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(view) {
  const start = Math.max(0, view.byteLength - (MAX_ZIP_COMMENT + 22));
  for (let offset = view.byteLength - 22; offset >= start; offset--) {
    if (view.getUint32(offset, true) === ZIP_EOCD) return offset;
  }
  return -1;
}

async function readZipEntry(data, entry) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== ZIP_LOCAL_FILE) {
    throw new Error('This DOCX archive has an invalid file entry.');
  }

  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const compressed = data.slice(dataOffset, dataOffset + entry.compressedSize);

  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Compressed DOCX files are not supported in this browser.');
    }
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
    if (entry.uncompressedSize && inflated.byteLength !== entry.uncompressedSize) {
      throw new Error('This DOCX archive could not be decompressed correctly.');
    }
    return inflated;
  }

  throw new Error('This DOCX uses an unsupported compression format.');
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
