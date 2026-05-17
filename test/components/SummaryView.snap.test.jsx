import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import SummaryView from '../../src/content/panel/components/views/SummaryView.jsx';

const TERMS = [
  { label: 'idea', definition: 'A thought.' },
  { label: 'depth', definition: 'A measure.' },
];

describe('SummaryView snapshots', () => {
  it('five bullets, some with term highlights', () => {
    const { container } = render(
      <SummaryView
        data={{
          bullets: [
            'First [[term:0|idea]] anchors the piece.',
            'Second observation about [[term:1|depth]].',
            'Third synthesis.',
            'Fourth tension.',
            'Fifth conclusion.',
          ],
          terms: TERMS,
        }}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
