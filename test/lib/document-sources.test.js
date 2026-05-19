import { describe, expect, it } from 'vitest';
import {
  arxivHtmlCandidates,
  documentSourceFromUrl,
  epubCandidates,
  googleDocTextCandidates,
  isPdfUrl,
  markdownCandidates,
  notebookCandidates,
  parseArxivId,
  parseGoogleDoc,
  textCandidates,
  wordDocxCandidates,
} from '../../src/lib/document-sources.js';

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

  it('detects Google Docs and builds text export candidates', () => {
    const url = 'https://docs.google.com/document/d/abc123/edit';
    expect(documentSourceFromUrl(url)).toEqual({
      kind: 'document',
      sourceType: 'google-doc',
      label: 'Google Doc',
    });
    expect(parseGoogleDoc(url)).toEqual({ id: 'abc123', published: false });
    expect(googleDocTextCandidates(url)).toEqual([
      {
        url: 'https://docs.google.com/document/d/abc123/export?format=txt',
        label: 'Google Docs text',
      },
    ]);
  });

  it('detects published Google Docs text export candidates', () => {
    expect(googleDocTextCandidates('https://docs.google.com/document/d/e/2PACX-test/pub')).toEqual([
      {
        url: 'https://docs.google.com/document/d/e/2PACX-test/pub?output=txt',
        label: 'Google Docs published text',
      },
    ]);
  });

  it('detects direct and embedded Word DOCX candidates', () => {
    expect(documentSourceFromUrl('https://example.com/reports/brief.docx?download=1')).toEqual({
      kind: 'document',
      sourceType: 'word-docx',
      label: 'Word document',
    });
    expect(
      wordDocxCandidates(
        'https://view.officeapps.live.com/op/view.aspx?src=https%3A%2F%2Fexample.com%2Fbrief.docx',
      ),
    ).toEqual([{ url: 'https://example.com/brief.docx', label: 'Word document' }]);
  });

  it('detects direct EPUB URLs', () => {
    const url = 'https://example.com/books/example.epub?download=1';
    expect(documentSourceFromUrl(url)).toEqual({
      kind: 'document',
      sourceType: 'epub',
      label: 'EPUB',
    });
    expect(epubCandidates(url)).toEqual([{ url, label: 'EPUB' }]);
  });

  it('detects Project Gutenberg EPUB filenames', () => {
    const url = 'https://www.gutenberg.org/ebooks/1342.epub3.images';
    expect(documentSourceFromUrl(url)).toEqual({
      kind: 'document',
      sourceType: 'epub',
      label: 'EPUB',
    });
  });

  it('detects direct Markdown and plain text URLs', () => {
    const mdUrl = 'https://example.com/essay.md?raw=1';
    expect(documentSourceFromUrl(mdUrl)).toEqual({
      kind: 'document',
      sourceType: 'markdown',
      label: 'Markdown',
      url: mdUrl,
    });
    expect(markdownCandidates(mdUrl)).toEqual([{ url: mdUrl, label: 'Markdown' }]);

    const txtUrl = 'https://example.com/essay.txt';
    expect(documentSourceFromUrl(txtUrl)).toEqual({
      kind: 'document',
      sourceType: 'raw-text',
      label: 'Plain text',
      url: txtUrl,
    });
    expect(textCandidates(txtUrl)).toEqual([{ url: txtUrl, label: 'Plain text' }]);
  });

  it('converts GitHub Markdown and text blob pages to raw URLs', () => {
    expect(markdownCandidates('https://github.com/zachzwy/depth/blob/main/README.md')).toEqual([
      {
        url: 'https://raw.githubusercontent.com/zachzwy/depth/main/README.md',
        label: 'Markdown',
      },
    ]);
    expect(textCandidates('https://github.com/zachzwy/depth/blob/main/examples/note.txt')).toEqual([
      {
        url: 'https://raw.githubusercontent.com/zachzwy/depth/main/examples/note.txt',
        label: 'Plain text',
      },
    ]);
  });

  it('detects direct and GitHub Jupyter notebook URLs', () => {
    const direct = 'https://example.com/notebooks/analysis.ipynb';
    expect(documentSourceFromUrl(direct)).toEqual({
      kind: 'document',
      sourceType: 'jupyter-notebook',
      label: 'Jupyter notebook',
      url: direct,
    });
    expect(notebookCandidates('https://github.com/jakevdp/PythonDataScienceHandbook/blob/master/notebooks/01.00-IPython-Beyond-Normal-Python.ipynb')).toEqual([
      {
        url: 'https://raw.githubusercontent.com/jakevdp/PythonDataScienceHandbook/master/notebooks/01.00-IPython-Beyond-Normal-Python.ipynb',
        label: 'Jupyter notebook',
      },
    ]);
  });
});
