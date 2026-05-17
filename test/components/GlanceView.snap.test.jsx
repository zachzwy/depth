import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import GlanceView from '../../src/content/panel/components/views/GlanceView.jsx';
import { en } from '../../src/lib/i18n/en.js';

const TERMS = [
  { label: 'Convolution', definition: 'Sliding-window combination.' },
  { label: 'Stride', definition: 'How far the window moves.' },
];

describe('GlanceView snapshots', () => {
  it('high confidence with no highlighted terms', () => {
    const { container } = render(
      <GlanceView
        data={{
          glance: 'A central claim about reading.',
          confidence: 'high',
          termCount: 0,
          highlightedIndex: 0,
          terms: [],
        }}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('medium confidence with one highlighted term', () => {
    const { container } = render(
      <GlanceView
        data={{
          glance: 'The [[term:0|convolution]] sets the pace.',
          confidence: 'medium',
          termCount: 2,
          highlightedIndex: 1,
          terms: TERMS,
        }}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('low confidence with two highlighted terms', () => {
    const { container } = render(
      <GlanceView
        data={{
          glance: 'Vary [[term:1|stride]] to shift the [[term:0|convolution]].',
          confidence: 'low',
          termCount: 2,
          highlightedIndex: 2,
          terms: TERMS,
        }}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
