import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/preact';
import TermHighlight, {
  stripUnsupportedTermMarkup,
} from '../../src/content/panel/components/TermHighlight.jsx';

describe('TermHighlight', () => {
  it('renders supported term tokens as highlighted spans', () => {
    const { container } = render(
      <TermHighlight
        text="The [[term:0|Transformer]] uses attention."
        terms={[{ label: 'Transformer', definition: 'A sequence model.' }]}
      />,
    );

    expect(container.querySelector('.term')?.textContent).toBe('Transformer');
    expect(container.textContent).toBe('The Transformer uses attention.');
  });

  it('strips unsupported wiki-link syntax to the display label', () => {
    expect(stripUnsupportedTermMarkup('Use [[Transformer|Transformer]] blocks.')).toBe(
      'Use Transformer blocks.',
    );

    const { container } = render(
      <TermHighlight
        text="Use [[Transformer|Transformer]] and [[self-attention|self-attention]]."
        terms={[]}
      />,
    );

    expect(container.textContent).toBe('Use Transformer and self-attention.');
  });
});
