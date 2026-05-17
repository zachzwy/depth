import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import PaywallCard from '../../src/content/panel/components/PaywallCard.jsx';
import { en } from '../../src/lib/i18n/en.js';

describe('PaywallCard', () => {
  it('renders the upgrade link when upgradeUrl is present', () => {
    const { container } = render(
      <PaywallCard
        error={{
          code: 'LIMIT_REACHED',
          message: "Daily free quota reached.",
          upgradeUrl: 'https://depth.app/upgrade',
        }}
        onUseOwnKey={() => {}}
        ui={en}
      />,
    );
    const link = container.querySelector('a.state__cta');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://depth.app/upgrade');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toBe(en.paywallUpgrade);
  });

  it('omits the upgrade link when upgradeUrl is missing', () => {
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED', message: 'no quota' }}
        onUseOwnKey={() => {}}
        ui={en}
      />,
    );
    expect(container.querySelector('a.state__cta')).toBeNull();
    expect(container.querySelector('button.state__secondary')).not.toBeNull();
  });

  it('falls back to ui.paywallBody when error has no message', () => {
    const { container } = render(
      <PaywallCard error={{ code: 'LIMIT_REACHED' }} onUseOwnKey={() => {}} ui={en} />,
    );
    expect(container.textContent).toContain(en.paywallBody);
  });

  it('invokes onUseOwnKey when the BYOK button is clicked', () => {
    const onUseOwnKey = vi.fn();
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED', upgradeUrl: 'https://x' }}
        onUseOwnKey={onUseOwnKey}
        ui={en}
      />,
    );
    fireEvent.click(container.querySelector('button.state__secondary'));
    expect(onUseOwnKey).toHaveBeenCalledOnce();
  });
});
