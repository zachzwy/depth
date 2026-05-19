import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import CommunityVersionsCard from '../../src/content/panel/components/CommunityVersionsCard.jsx';
import { en } from '../../src/lib/i18n/en.js';

describe('CommunityVersionsCard', () => {
  it('available state with count=1 uses the singular headline', () => {
    const { container } = render(
      <CommunityVersionsCard
        status="available"
        count={1}
        onUseLatest={() => {}}
        onGenerateFresh={() => {}}
        ui={en}
      />,
    );
    expect(container.textContent).toContain(en.communityAvailableOne);
    expect(container.textContent).not.toContain(en.communityAvailableMany(2));
  });

  it('available state with count>1 uses the plural headline', () => {
    const { container } = render(
      <CommunityVersionsCard
        status="available"
        count={3}
        onUseLatest={() => {}}
        onGenerateFresh={() => {}}
        ui={en}
      />,
    );
    expect(container.textContent).toContain(en.communityAvailableMany(3));
  });

  it('fires onUseLatest and onGenerateFresh on the matching buttons', () => {
    const onUseLatest = vi.fn();
    const onGenerateFresh = vi.fn();
    const { container } = render(
      <CommunityVersionsCard
        status="available"
        count={1}
        onUseLatest={onUseLatest}
        onGenerateFresh={onGenerateFresh}
        ui={en}
      />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toBe(en.communityUseLatest);
    expect(buttons[1].textContent).toBe(en.communityGenerateFresh);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(onUseLatest).toHaveBeenCalledOnce();
    expect(onGenerateFresh).toHaveBeenCalledOnce();
  });

  it('hydrating state disables both buttons and shows the loading label', () => {
    const { container } = render(
      <CommunityVersionsCard
        status="hydrating"
        count={1}
        onUseLatest={() => {}}
        onGenerateFresh={() => {}}
        ui={en}
      />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons[0].textContent).toBe(en.communityHydrating);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);
  });

  it('using state shows the post-hydration notice + Generate fresh', () => {
    const onGenerateFresh = vi.fn();
    const { container } = render(
      <CommunityVersionsCard
        status="using"
        count={1}
        onUseLatest={() => {}}
        onGenerateFresh={onGenerateFresh}
        ui={en}
      />,
    );
    expect(container.textContent).toContain(en.communityHydratedPrefix.trim());
    expect(container.textContent).toContain(en.communityHydratedLink);
    expect(container.textContent).toContain(en.communityHydratedSuffix.trim());
    // The "community version" phrase is a real anchor pointing at /community.
    const link = container.querySelector('.community-card__link');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://depth.microfalls.com/community');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toBe(en.communityHydratedLink);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toBe(en.communityGenerateFresh);
    fireEvent.click(buttons[0]);
    expect(onGenerateFresh).toHaveBeenCalledOnce();
  });
});
