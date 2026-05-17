import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import PanelHeader from '../../src/content/panel/components/PanelHeader.jsx';
import { en } from '../../src/lib/i18n/en.js';

const noop = () => {};

describe('PanelHeader snapshots', () => {
  it('default state with regenerate available', () => {
    const { container } = render(
      <PanelHeader
        title="An Article About Cats"
        onClose={noop}
        onOpenSettings={noop}
        onRegenerate={noop}
        canRegenerate={true}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('regenerate disabled', () => {
    const { container } = render(
      <PanelHeader
        title="Title"
        onClose={noop}
        onOpenSettings={noop}
        onRegenerate={noop}
        canRegenerate={false}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('truncates long titles', () => {
    const long = 'A'.repeat(80);
    const { container } = render(
      <PanelHeader title={long} onClose={noop} onOpenSettings={noop} onRegenerate={noop} ui={en} />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
