import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import UnsupportedCard from '../../src/content/panel/components/UnsupportedCard.jsx';
import { en } from '../../src/lib/i18n/en.js';
import { zhHans } from '../../src/lib/i18n/zh-Hans.js';

afterEach(cleanup);

function fixture(kind, overrides = {}) {
  return {
    title: 'Some page',
    byline: null,
    siteName: null,
    text: '',
    wordCount: 0,
    truncated: false,
    classification: { kind },
    ...overrides,
  };
}

describe('UnsupportedCard snapshots', () => {
  it('feed variant (English)', () => {
    const { container } = render(
      <UnsupportedCard extracted={fixture('feed')} onTryAnyway={() => {}} ui={en} />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('discussion variant (English)', () => {
    const { container } = render(
      <UnsupportedCard
        extracted={fixture('discussion', { wordCount: 320 })}
        onTryAnyway={() => {}}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('unsupported variant (English)', () => {
    const { container } = render(
      <UnsupportedCard extracted={fixture('unsupported')} onTryAnyway={() => {}} ui={en} />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('text-not-article variant (English)', () => {
    const { container } = render(
      <UnsupportedCard
        extracted={fixture('unsupported', {
          wordCount: 220,
          classification: { kind: 'unsupported', reason: 'text-not-article' },
        })}
        onTryAnyway={() => {}}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('media transcript-required variant (English)', () => {
    const { container } = render(
      <UnsupportedCard
        extracted={fixture('media', {
          sourceLabel: 'YouTube video',
          classification: { kind: 'media', sourceType: 'youtube-video', reason: 'transcript-required' },
        })}
        onTryAnyway={() => {}}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('feed variant (Simplified Chinese)', () => {
    const { container } = render(
      <UnsupportedCard extracted={fixture('feed')} onTryAnyway={() => {}} ui={zhHans} />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe('UnsupportedCard interactions', () => {
  it('fires onTryAnyway when the link is clicked', () => {
    const onTryAnyway = vi.fn();
    const { getByText } = render(
      <UnsupportedCard extracted={fixture('feed')} onTryAnyway={onTryAnyway} ui={en} />,
    );
    fireEvent.click(getByText(en.tryAnyway));
    expect(onTryAnyway).toHaveBeenCalledOnce();
  });

  it('omits the Try anyway link when no callback is provided', () => {
    const { queryByText } = render(
      <UnsupportedCard extracted={fixture('feed')} ui={en} />,
    );
    expect(queryByText(en.tryAnyway)).toBeNull();
  });

  it('omits the Try anyway link when a transcript is required', () => {
    const { queryByText } = render(
      <UnsupportedCard
        extracted={fixture('media', {
          classification: { kind: 'media', sourceType: 'audio', reason: 'transcript-required' },
        })}
        onTryAnyway={() => {}}
        ui={en}
      />,
    );
    expect(queryByText(en.tryAnyway)).toBeNull();
  });
});
