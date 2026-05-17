import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import DepthSlider from '../../src/content/panel/components/DepthSlider.jsx';
import { LEVELS } from '../../src/lib/levels.js';
import { en } from '../../src/lib/i18n/en.js';

describe('DepthSlider snapshots', () => {
  it('no levels ready, at level 1', () => {
    const { container } = render(
      <DepthSlider levels={LEVELS} level={1} onChange={() => {}} readyLevels={new Set()} ui={en} />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('levels 1-3 ready, at level 3', () => {
    const { container } = render(
      <DepthSlider
        levels={LEVELS}
        level={3}
        onChange={() => {}}
        readyLevels={new Set([1, 2, 3])}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('all levels ready, at level 5', () => {
    const { container } = render(
      <DepthSlider
        levels={LEVELS}
        level={5}
        onChange={() => {}}
        readyLevels={new Set([1, 2, 3, 4, 5])}
        ui={en}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
