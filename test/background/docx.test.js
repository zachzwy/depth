import { describe, expect, it } from 'vitest';
import { docxXmlToText, extractDocxTextFromBytes } from '../../src/background/docx.js';

describe('DOCX text extraction', () => {
  it('extracts paragraphs from Word document XML', () => {
    const xml = `
      <w:document>
        <w:body>
          <w:p><w:r><w:t>First paragraph &amp; claim.</w:t></w:r></w:p>
          <w:p><w:r><w:t>Second</w:t></w:r><w:r><w:tab/><w:t>paragraph.</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `;

    expect(docxXmlToText(xml)).toBe('First paragraph & claim.\n\nSecond paragraph.');
  });

  it('reads word/document.xml from a DOCX archive', async () => {
    const xml = `
      <w:document>
        <w:body>
          <w:p><w:r><w:t>${'Depth can extract document text from docx archives. '.repeat(8)}</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `;

    await expect(extractDocxTextFromBytes(createStoredZip('word/document.xml', xml))).resolves.toContain(
      'Depth can extract document text',
    );
  });
});

function createStoredZip(name, content) {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const dataBytes = encoder.encode(content);
  const localSize = 30 + nameBytes.length + dataBytes.length;
  const centralSize = 46 + nameBytes.length;
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);

  writeLocalHeader(view, nameBytes, dataBytes);
  out.set(nameBytes, 30);
  out.set(dataBytes, 30 + nameBytes.length);

  const centralOffset = localSize;
  writeCentralHeader(view, centralOffset, nameBytes, dataBytes);
  out.set(nameBytes, centralOffset + 46);

  const eocdOffset = localSize + centralSize;
  view.setUint32(eocdOffset, 0x06054b50, true);
  view.setUint16(eocdOffset + 8, 1, true);
  view.setUint16(eocdOffset + 10, 1, true);
  view.setUint32(eocdOffset + 12, centralSize, true);
  view.setUint32(eocdOffset + 16, centralOffset, true);

  return out;
}

function writeLocalHeader(view, nameBytes, dataBytes) {
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint32(18, dataBytes.length, true);
  view.setUint32(22, dataBytes.length, true);
}

function writeCentralHeader(view, offset, nameBytes, dataBytes) {
  view.setUint32(offset, 0x02014b50, true);
  view.setUint16(offset + 4, 20, true);
  view.setUint16(offset + 6, 20, true);
  view.setUint32(offset + 20, dataBytes.length, true);
  view.setUint32(offset + 24, dataBytes.length, true);
  view.setUint16(offset + 28, nameBytes.length, true);
  view.setUint32(offset + 42, 0, true);
}
