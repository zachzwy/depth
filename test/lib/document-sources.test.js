import { describe, expect, it } from 'vitest';
import { arxivHtmlCandidates, isPdfUrl, parseArxivId } from '../../src/lib/document-sources.js';

describe('document source URL helpers', () => {
  it('detects direct PDF URLs', () => {
    expect(isPdfUrl('https://example.com/paper.pdf')).toBe(true);
    expect(isPdfUrl('https://example.com/paper.PDF?download=1')).toBe(true);
  });

  it('detects arXiv PDF URLs without a .pdf suffix', () => {
    expect(isPdfUrl('https://arxiv.org/pdf/1706.03762')).toBe(true);
    expect(parseArxivId('https://arxiv.org/pdf/1706.03762v7')).toBe('1706.03762v7');
    expect(parseArxivId('https://arxiv.org/pdf/cs/0310051')).toBe('cs/0310051');
  });

  it('does not mark ordinary HTML pages as PDFs', () => {
    expect(isPdfUrl('https://arxiv.org/abs/1706.03762')).toBe(false);
    expect(isPdfUrl('https://example.com/article')).toBe(false);
    expect(isPdfUrl('not a url')).toBe(false);
  });

  it('builds ar5iv candidates for arXiv PDFs', () => {
    expect(arxivHtmlCandidates('https://arxiv.org/pdf/1706.03762')).toEqual([
      {
        url: 'https://ar5iv.labs.arxiv.org/html/1706.03762',
        label: 'ar5iv HTML',
      },
    ]);
  });
});
