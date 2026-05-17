import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import ReadView from '../../src/content/panel/components/views/ReadView.jsx';
import { en } from '../../src/lib/i18n/en.js';

describe('ReadView snapshots', () => {
  it('two sections with stats', () => {
    const { container } = render(
      <ReadView
        data={{
          stats: { scale: '8.4', trimmed: '~62%', terms: 3 },
          sections: [
            {
              heading: 'Premise',
              paragraphs: ['The piece opens by stating the [[term:0|central claim]].'],
            },
            {
              heading: 'Tensions',
              paragraphs: [
                'Counter-argument lives here.',
                'And a follow-up that resolves it.',
              ],
            },
          ],
          terms: [{ label: 'central claim', definition: 'The thesis.' }],
        }}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
