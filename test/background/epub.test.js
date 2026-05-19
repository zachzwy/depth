import { describe, expect, it } from 'vitest';
import { extractEpubTextFromBytes, xhtmlToText } from '../../src/background/epub.js';
import { createStoredZip } from './zip-fixtures.js';

describe('EPUB text extraction', () => {
  it('flattens XHTML chapters into readable text', () => {
    const html = `
      <html>
        <body>
          <nav>Table of contents</nav>
          <h1>Chapter One</h1>
          <p>Depth reads &amp; summarizes EPUB chapters.</p>
          <ul><li>First idea</li><li>Second idea</li></ul>
        </body>
      </html>
    `;

    expect(xhtmlToText(html)).toBe(
      'Chapter One\n\nDepth reads & summarizes EPUB chapters.\n\nFirst idea\n\nSecond idea',
    );
  });

  it('reads spine-ordered XHTML files from an EPUB archive', async () => {
    const epub = createStoredZip({
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': `
        <container>
          <rootfiles>
            <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>
      `,
      'OEBPS/content.opf': `
        <package>
          <metadata><dc:title>Example EPUB</dc:title></metadata>
          <manifest>
            <item id="chapter-1" href="chapters/ch1.xhtml" media-type="application/xhtml+xml"/>
            <item id="chapter-2" href="chapters/ch2.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine>
            <itemref idref="chapter-1"/>
            <itemref idref="chapter-2"/>
          </spine>
        </package>
      `,
      'OEBPS/chapters/ch1.xhtml': `
        <html><body><h1>Opening</h1><p>${'EPUB files are article-heavy reading containers. '.repeat(6)}</p></body></html>
      `,
      'OEBPS/chapters/ch2.xhtml': `
        <html><body><h1>Second</h1><p>${'Depth can follow the package spine and extract chapter text. '.repeat(6)}</p></body></html>
      `,
    });

    const extracted = await extractEpubTextFromBytes(epub);

    expect(extracted.title).toBe('Example EPUB');
    expect(extracted.sectionCount).toBe(2);
    expect(extracted.text).toContain('Opening');
    expect(extracted.text).toContain('Second');
    expect(extracted.text.indexOf('Opening')).toBeLessThan(extracted.text.indexOf('Second'));
  });
});
