import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import ShareDialog from '../../src/content/panel/components/ShareDialog.jsx';
import { en } from '../../src/lib/i18n/en.js';

describe('ShareDialog', () => {
  it('consent mode renders title, body, and three actions', () => {
    const { container } = render(
      <ShareDialog
        status="consent"
        consentRequired
        onConfirm={() => {}}
        onAlways={() => {}}
        onCopy={() => {}}
        onClose={() => {}}
        ui={en}
      />,
    );
    expect(container.textContent).toContain(en.shareConsentTitle);
    expect(container.textContent).toContain(en.shareConsentBody);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toBe(en.shareConfirm);
    expect(buttons[1].textContent).toBe(en.shareAlways);
    expect(buttons[2].textContent).toBe(en.cancel);
  });

  it('consent mode hides body + Always when consent is not required', () => {
    const { container } = render(
      <ShareDialog
        status="consent"
        consentRequired={false}
        onConfirm={() => {}}
        onClose={() => {}}
        ui={en}
      />,
    );
    expect(container.textContent).not.toContain(en.shareConsentBody);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toBe(en.shareConfirm);
    expect(buttons[1].textContent).toBe(en.cancel);
  });

  it('publishing mode disables all buttons', () => {
    const { container } = render(
      <ShareDialog
        status="publishing"
        consentRequired
        onConfirm={() => {}}
        onAlways={() => {}}
        onClose={() => {}}
        ui={en}
      />,
    );
    for (const b of container.querySelectorAll('button')) {
      expect(b.disabled).toBe(true);
    }
  });

  it('success mode shows the share URL and a copy button', () => {
    const onCopy = vi.fn();
    const { container } = render(
      <ShareDialog
        status="success"
        consentRequired
        shareUrl="https://depth.microfalls.com/s/abcdEFGH"
        onCopy={onCopy}
        onClose={() => {}}
        ui={en}
      />,
    );
    expect(container.textContent).toContain(en.shareSuccess);
    expect(container.textContent).toContain('https://depth.microfalls.com/s/abcdEFGH');
    const copyBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === en.shareCopyAgain,
    );
    expect(copyBtn).toBeTruthy();
    fireEvent.click(copyBtn);
    expect(onCopy).toHaveBeenCalledOnce();
  });

  it('error mode shows the message and offers Try again', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <ShareDialog
        status="error"
        consentRequired
        errorMessage="Daily publish limit reached."
        onConfirm={onConfirm}
        onClose={() => {}}
        ui={en}
      />,
    );
    expect(container.textContent).toContain('Daily publish limit reached.');
    const tryBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === en.tryAgain,
    );
    expect(tryBtn).toBeTruthy();
    fireEvent.click(tryBtn);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('confirm and always handlers fire from consent mode', () => {
    const onConfirm = vi.fn();
    const onAlways = vi.fn();
    const { container } = render(
      <ShareDialog
        status="consent"
        consentRequired
        onConfirm={onConfirm}
        onAlways={onAlways}
        onClose={() => {}}
        ui={en}
      />,
    );
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[0]);
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(buttons[1]);
    expect(onAlways).toHaveBeenCalledOnce();
  });
});
