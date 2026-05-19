import { beforeEach, describe, it, expect, vi } from 'vitest';
import { classifyByUrl, extractPage } from '../../src/content/extractor.js';

describe('classifyByUrl', () => {
  it('returns null for ordinary article URLs', () => {
    expect(classifyByUrl('https://example.com/posts/why-rust')).toBeNull();
    expect(classifyByUrl('https://blog.substack.com/p/some-essay')).toBeNull();
    expect(classifyByUrl('https://www.nytimes.com/2025/01/01/section/headline.html')).toBeNull();
  });

  it('returns null for unparseable URLs', () => {
    expect(classifyByUrl('not a url')).toBeNull();
    expect(classifyByUrl('')).toBeNull();
  });

  it('classifies X and Twitter as feed regardless of path', () => {
    expect(classifyByUrl('https://x.com/')).toBe('feed');
    expect(classifyByUrl('https://x.com/someuser')).toBe('feed');
    expect(classifyByUrl('https://twitter.com/home')).toBe('feed');
    expect(classifyByUrl('https://www.x.com/elonmusk/status/123')).toBe('feed');
  });

  it('classifies Bluesky and Threads as feed', () => {
    expect(classifyByUrl('https://bsky.app/')).toBe('feed');
    expect(classifyByUrl('https://threads.net/@someone')).toBe('feed');
  });

  it('classifies HN front-page surfaces as feed', () => {
    expect(classifyByUrl('https://news.ycombinator.com/')).toBe('feed');
    expect(classifyByUrl('https://news.ycombinator.com/newest')).toBe('feed');
    expect(classifyByUrl('https://news.ycombinator.com/best')).toBe('feed');
  });

  it('classifies HN item pages as discussion (takes priority over feed)', () => {
    expect(classifyByUrl('https://news.ycombinator.com/item?id=12345')).toBe('discussion');
  });

  it('classifies Reddit roots and subreddit roots as feed', () => {
    expect(classifyByUrl('https://reddit.com/')).toBe('feed');
    expect(classifyByUrl('https://www.reddit.com/r/programming/')).toBe('feed');
    expect(classifyByUrl('https://reddit.com/r/rust')).toBe('feed');
  });

  it('classifies Reddit comment threads as discussion', () => {
    expect(classifyByUrl('https://reddit.com/r/rust/comments/abc123/title/')).toBe('discussion');
    expect(classifyByUrl('https://old.reddit.com/r/rust/comments/abc123/title/')).toBe('discussion');
  });

  it('classifies GitHub issues and pull requests as discussion', () => {
    expect(classifyByUrl('https://github.com/foo/bar/issues/42')).toBe('discussion');
    expect(classifyByUrl('https://github.com/foo/bar/pull/7')).toBe('discussion');
  });

  it('does not classify GitHub repo roots as discussion', () => {
    expect(classifyByUrl('https://github.com/foo/bar')).toBeNull();
    expect(classifyByUrl('https://github.com/foo/bar/blob/main/README.md')).toBeNull();
  });

  it('classifies Stack Overflow questions as discussion', () => {
    expect(classifyByUrl('https://stackoverflow.com/questions/12345/some-q')).toBe('discussion');
  });
});

describe('extractPage fallback containers', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    history.pushState(null, '', '/');
  });

  it('marks PDF URLs for background extraction before article fallback', () => {
    history.pushState(null, '', '/paper.pdf');
    document.title = '1706.03762';
    document.body.innerHTML = '<main><h1>Attention Is All You Need</h1></main>';

    const extracted = extractPage();

    expect(extracted.classification).toEqual({
      kind: 'pdf',
      sourceType: 'pdf',
      reason: 'needs-background-extraction',
    });
    expect(extracted.text).toBe('');
  });

  it('marks Google Docs for background extraction before article fallback', () => {
    vi.stubGlobal('location', { href: 'https://docs.google.com/document/d/abc123/edit' });
    document.title = 'Product Strategy - Google Docs';
    document.body.innerHTML = '<main><h1>Product Strategy</h1></main>';

    const extracted = extractPage();

    expect(extracted.classification).toEqual({
      kind: 'document',
      sourceType: 'google-doc',
      reason: 'needs-background-extraction',
    });
    expect(extracted.text).toBe('');
  });

  it('marks direct DOCX URLs for background extraction', () => {
    vi.stubGlobal('location', { href: 'https://example.com/brief.docx' });
    document.title = 'brief.docx';
    document.body.innerHTML = '<main><h1>Brief</h1></main>';

    const extracted = extractPage();

    expect(extracted.classification).toEqual({
      kind: 'document',
      sourceType: 'word-docx',
      reason: 'needs-background-extraction',
    });
    expect(extracted.text).toBe('');
  });

  it('marks direct EPUB URLs for background extraction', () => {
    vi.stubGlobal('location', { href: 'https://example.com/books/example.epub' });
    document.title = 'example.epub';
    document.body.innerHTML = '<main><h1>Example EPUB</h1></main>';

    const extracted = extractPage();

    expect(extracted.classification).toEqual({
      kind: 'document',
      sourceType: 'epub',
      reason: 'needs-background-extraction',
    });
    expect(extracted.text).toBe('');
  });

  it('marks known ebook pages with EPUB links for background extraction', () => {
    vi.stubGlobal('location', { href: 'https://www.gutenberg.org/ebooks/1342' });
    document.title = 'Pride and Prejudice by Jane Austen';
    document.body.innerHTML = `
      <h1>Pride and Prejudice</h1>
      <a href="/ebooks/1342.epub3.images">EPUB3</a>
    `;

    const extracted = extractPage();

    expect(extracted.classification).toEqual({
      kind: 'document',
      sourceType: 'epub',
      reason: 'needs-background-extraction',
    });
    expect(extracted.sourceUrl).toBe('https://www.gutenberg.org/ebooks/1342.epub3.images');
    expect(extracted.text).toBe('');
  });

  it('marks GitHub Markdown blob pages for raw background extraction', () => {
    vi.stubGlobal('location', { href: 'https://github.com/zachzwy/depth/blob/main/README.md' });
    document.title = 'README.md';
    document.body.innerHTML = '<main><h1>README.md</h1></main>';

    const extracted = extractPage();

    expect(extracted.classification).toEqual({
      kind: 'document',
      sourceType: 'markdown',
      reason: 'needs-background-extraction',
    });
    expect(extracted.sourceUrl).toBe('https://raw.githubusercontent.com/zachzwy/depth/main/README.md');
    expect(extracted.text).toBe('');
  });

  it('marks direct plain text URLs for background extraction', () => {
    vi.stubGlobal('location', { href: 'https://example.com/notes/essay.txt' });
    document.title = 'essay.txt';
    document.body.innerHTML = '<pre>Plain essay text</pre>';

    const extracted = extractPage();

    expect(extracted.classification).toEqual({
      kind: 'document',
      sourceType: 'raw-text',
      reason: 'needs-background-extraction',
    });
    expect(extracted.sourceUrl).toBe('https://example.com/notes/essay.txt');
    expect(extracted.text).toBe('');
  });

  it('marks GitHub Jupyter notebook blob pages for raw background extraction', () => {
    vi.stubGlobal('location', {
      href: 'https://github.com/jakevdp/PythonDataScienceHandbook/blob/master/notebooks/01.00-IPython-Beyond-Normal-Python.ipynb',
    });
    document.title = '01.00-IPython-Beyond-Normal-Python.ipynb';
    document.body.innerHTML = '<main><h1>Notebook</h1></main>';

    const extracted = extractPage();

    expect(extracted.classification).toEqual({
      kind: 'document',
      sourceType: 'jupyter-notebook',
      reason: 'needs-background-extraction',
    });
    expect(extracted.sourceUrl).toBe(
      'https://raw.githubusercontent.com/jakevdp/PythonDataScienceHandbook/master/notebooks/01.00-IPython-Beyond-Normal-Python.ipynb',
    );
    expect(extracted.text).toBe('');
  });

  it('marks GitHub LaTeX blob pages for raw background extraction', () => {
    vi.stubGlobal('location', {
      href: 'https://github.com/example/paper/blob/main/main.tex',
    });
    document.title = 'main.tex';
    document.body.innerHTML = '<main><h1>main.tex</h1></main>';

    const extracted = extractPage();

    expect(extracted.classification).toEqual({
      kind: 'document',
      sourceType: 'latex',
      reason: 'needs-background-extraction',
    });
    expect(extracted.sourceUrl).toBe('https://raw.githubusercontent.com/example/paper/main/main.tex');
    expect(extracted.text).toBe('');
  });

  it('extracts Mintlify-style docs content without semantic article wrappers', () => {
    history.pushState(null, '', '/oss/python/langchain/multi-agent/index');
    document.title = 'Multi-agent - Docs by LangChain';
    document.body.innerHTML = `
      <nav>Navigation Multi-agent Search</nav>
      <div id="body-content">
        <div id="content-container">
          <div id="content-area">
            <header id="header"><h1 id="page-title">Multi-agent</h1></header>
            <div>
              Multi-agent systems coordinate specialized components to tackle complex workflows.
              Context management, distributed development, and parallelization are common reasons
              to split work across subagents, handoffs, skills, routers, or custom workflows.
              These patterns help developers choose the right architecture for latency, cost,
              context isolation, and user interaction needs. ${'Additional documentation detail. '.repeat(12)}
            </div>
          </div>
        </div>
      </div>
      <footer>Resources Company</footer>
    `;

    const extracted = extractPage();

    expect(extracted.classification.kind).toBe('article');
    expect(extracted.title).toBe('Multi-agent - Docs by LangChain');
    expect(extracted.text).toContain('Multi-agent systems coordinate specialized components');
    expect(extracted.text).not.toContain('Resources Company');
  });

  it('extracts old static essays with body-level headings and br paragraphs', () => {
    history.pushState(null, '', '/IncIdeas/BitterLesson.html');
    document.title = 'The Bitter Lesson';
    document.body.innerHTML = `
      <span class="style1">
        <h1>The Bitter Lesson<br></h1>
        <h2>Rich Sutton</h2>
        <h3>March 13, 2019<br></h3>
        The biggest lesson that can be read from 70 years of AI research is that
        general methods that leverage computation are ultimately the most effective,
        and by a large margin. ${'Researchers seek to leverage human knowledge, but the only thing that matters in the long run is the leveraging of computation. '.repeat(10)}
        <br><br>
        In computer chess, the methods that defeated the world champion were based
        on massive, deep search. ${'Search and learning are general methods that use computation effectively. '.repeat(8)}
        <br><br>
        In speech recognition, statistical methods won out over human-knowledge-based
        methods. ${'The pattern repeated as more computation became available. '.repeat(8)}
        <br><br>
      </span>
    `;

    const extracted = extractPage();

    expect(extracted.classification.kind).toBe('article');
    expect(extracted.title).toBe('The Bitter Lesson');
    expect(extracted.text).toContain('The biggest lesson');
    expect(extracted.text).toContain('In computer chess');
  });

  it('marks text-heavy pages unsupported when the text is not article-shaped', () => {
    history.pushState(null, '', '/app/shell');
    document.title = 'Application Shell';
    document.body.innerHTML = `
      <div>
        Search Navigation Dashboard Settings Activity
        ${'This page has visible text, but no article heading or readable content container. '.repeat(8)}
      </div>
    `;

    const extracted = extractPage();

    expect(extracted.classification).toEqual({ kind: 'unsupported', reason: 'text-not-article' });
    expect(extracted.wordCount).toBeGreaterThan(0);
    expect(extracted.text).toContain('This page has visible text');
  });

  it('rejects link-heavy docs containers instead of treating navigation as an article', () => {
    history.pushState(null, '', '/docs/index');
    document.title = 'Docs Index';
    document.body.innerHTML = `
      <div id="content-area">
        <h1>Docs Index</h1>
        ${Array.from({ length: 24 }, (_, i) => `<a href="/docs/${i}">Navigation link ${i} with a long label</a>`).join(' ')}
        ${'Open a topic from the navigation list. '.repeat(4)}
      </div>
    `;

    const extracted = extractPage();

    expect(extracted.classification).toEqual({ kind: 'unsupported', reason: 'text-not-article' });
    expect(extracted.text).toContain('Navigation link');
  });
});
