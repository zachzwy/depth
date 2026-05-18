import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import PaywallCard from '../../src/content/panel/components/PaywallCard.jsx';
import { en } from '../../src/lib/i18n/en.js';

describe('PaywallCard (signed-in branch)', () => {
  it('renders the upgrade link when upgradeUrl is present', () => {
    const { container } = render(
      <PaywallCard
        error={{
          code: 'LIMIT_REACHED',
          message: "Daily free quota reached.",
          upgradeUrl: 'https://depth.app/upgrade',
        }}
        onUseOwnKey={() => {}}
        canUpgrade
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
        canUpgrade
        ui={en}
      />,
    );
    expect(container.querySelector('a.state__cta')).toBeNull();
    expect(container.querySelector('button.state__secondary')).not.toBeNull();
  });

  it('falls back to ui.paywallBody when error has no message', () => {
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED' }}
        onUseOwnKey={() => {}}
        canUpgrade
        ui={en}
      />,
    );
    expect(container.textContent).toContain(en.paywallBody);
  });

  it('invokes onUseOwnKey when the BYOK button is clicked', () => {
    const onUseOwnKey = vi.fn();
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED', upgradeUrl: 'https://x' }}
        onUseOwnKey={onUseOwnKey}
        canUpgrade
        ui={en}
      />,
    );
    fireEvent.click(container.querySelector('button.state__secondary'));
    expect(onUseOwnKey).toHaveBeenCalledOnce();
  });

  it('canUpgrade=true → click calls onUpgrade and preventDefaults the anchor', () => {
    const onUpgrade = vi.fn();
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED', upgradeUrl: 'https://depth.app/upgrade' }}
        onUseOwnKey={() => {}}
        onUpgrade={onUpgrade}
        canUpgrade
        ui={en}
      />,
    );
    const link = container.querySelector('a.state__cta');
    // dispatchEvent returns false when preventDefault was called.
    const dispatched = link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onUpgrade).toHaveBeenCalledOnce();
    expect(dispatched).toBe(false);
  });

  it('no onUpgrade prop → anchor proceeds even when canUpgrade is true', () => {
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED', upgradeUrl: 'https://depth.app/upgrade' }}
        onUseOwnKey={() => {}}
        canUpgrade
        ui={en}
      />,
    );
    const link = container.querySelector('a.state__cta');
    const dispatched = link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatched).toBe(true);
  });

  it('swallows onUpgrade rejections without throwing through the click handler', async () => {
    const onUpgrade = vi.fn().mockRejectedValue(new Error('network down'));
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED', upgradeUrl: 'https://depth.app/upgrade' }}
        onUseOwnKey={() => {}}
        onUpgrade={onUpgrade}
        canUpgrade
        ui={en}
      />,
    );
    const link = container.querySelector('a.state__cta');
    // Click should not throw synchronously even though onUpgrade rejects.
    expect(() =>
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
    ).not.toThrow();
    // Flush microtasks so the .catch() runs.
    await new Promise((r) => setTimeout(r, 0));
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });
});

describe('PaywallCard (anonymous branch)', () => {
  it('renders the Sign in button (not an anchor) when canUpgrade is false', () => {
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED', upgradeUrl: 'https://depth.app/upgrade' }}
        onUseOwnKey={() => {}}
        onSignIn={() => {}}
        canUpgrade={false}
        ui={en}
      />,
    );
    expect(container.querySelector('a.state__cta')).toBeNull();
    const cta = container.querySelector('button.state__cta');
    expect(cta).not.toBeNull();
    expect(cta.textContent).toBe(en.paywallSignIn);
  });

  it('shows the sign-in body copy, not the quota body', () => {
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED', message: 'Daily free quota reached.' }}
        onUseOwnKey={() => {}}
        onSignIn={() => {}}
        canUpgrade={false}
        ui={en}
      />,
    );
    expect(container.textContent).toContain(en.paywallSignInBody);
    expect(container.textContent).not.toContain('Daily free quota reached.');
  });

  it('invokes onSignIn when the Sign in button is clicked', () => {
    const onSignIn = vi.fn();
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED' }}
        onUseOwnKey={() => {}}
        onSignIn={onSignIn}
        canUpgrade={false}
        ui={en}
      />,
    );
    fireEvent.click(container.querySelector('button.state__cta'));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it('swallows onSignIn rejections without throwing through the click handler', async () => {
    const onSignIn = vi.fn().mockRejectedValue(new Error('oauth cancelled'));
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <PaywallCard
        error={{ code: 'LIMIT_REACHED' }}
        onUseOwnKey={() => {}}
        onSignIn={onSignIn}
        canUpgrade={false}
        ui={en}
      />,
    );
    expect(() => fireEvent.click(container.querySelector('button.state__cta'))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });
});
