import { describe, expect, it } from 'vitest';
import { docxXmlToText, extractDocxTextFromBytes } from '../../src/background/docx.js';
import { createStoredZip } from './zip-fixtures.js';

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

    await expect(
      extractDocxTextFromBytes(createStoredZip({ 'word/document.xml': xml })),
    ).resolves.toContain('Depth can extract document text');
  });
});
