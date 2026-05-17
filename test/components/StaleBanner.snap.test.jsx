import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import StaleBanner from '../../src/content/panel/components/StaleBanner.jsx';
import { en } from '../../src/lib/i18n/en.js';
import { zhHans } from '../../src/lib/i18n/zh-Hans.js';

describe('StaleBanner snapshots', () => {
  it('English copy', () => {
    const { container } = render(
      <StaleBanner onReload={() => {}} onDismiss={() => {}} ui={en} />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('Simplified Chinese copy', () => {
    const { container } = render(
      <StaleBanner onReload={() => {}} onDismiss={() => {}} ui={zhHans} />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
