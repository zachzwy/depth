import { describe, expect, it } from 'vitest';
import { readData } from '../../src/content/panel/level-data.js';

describe('readData', () => {
  it('counts terms that can actually render in Read paragraphs', () => {
    const data = readData({
      keyTerms: [
        { label: 'Transformer', definition: 'A sequence model.' },
        { label: 'self-attention', definition: 'Attention within one sequence.' },
        { label: 'unused term', definition: 'Not present.' },
      ],
      read: {
        sections: [
          {
            heading: 'Mechanism',
            paragraphs: [
              'The Transformer relies on self-attention.',
              'This paragraph references [[term:0|Transformer]] explicitly.',
            ],
          },
        ],
      },
    });

    expect(data.stats.terms).toBe(2);
  });

  it('does not count key terms that are absent from Read paragraphs', () => {
    const data = readData({
      keyTerms: [{ label: 'Transformer', definition: 'A sequence model.' }],
      read: {
        sections: [
          {
            heading: 'Summary',
            paragraphs: ['The article makes a broader argument without naming the term.'],
          },
        ],
      },
    });

    expect(data.stats.terms).toBe(0);
  });

  it('normalizes partial Read sections without paragraph arrays', () => {
    const data = readData({
      keyTerms: [{ label: 'Transformer', definition: 'A sequence model.' }],
      read: {
        sections: [
          { heading: 'Streaming section' },
          { heading: 'String paragraph', paragraphs: 'Transformer appears here.' },
          { heading: 'Mixed', paragraphs: ['Transformer appears again.', null, 42] },
        ],
      },
    });

    expect(data.sections).toEqual([
      { heading: 'Streaming section', paragraphs: [] },
      { heading: 'String paragraph', paragraphs: ['Transformer appears here.'] },
      { heading: 'Mixed', paragraphs: ['Transformer appears again.'] },
    ]);
    expect(data.stats.terms).toBe(1);
  });
});
