import { describe, it, expect } from 'vitest';
import { classifyByUrl } from '../../src/content/extractor.js';

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
