// Rendered after HostedPermissionCard when the hosted backend has
// Cloudflare Turnstile gating anonymous signups. The "Verify" button
// routes through the service worker so chrome.identity.launchWebAuthFlow
// receives the user-activation token from this click; the SW opens the
// captcha page, captures the resulting Turnstile token from the
// chromiumapp.org redirect, then calls completeHostedSignupWithCaptcha
// to mint the anonymous session.

import { useState } from 'preact/hooks';

export default function CaptchaCard({ onVerify, onOpenSettings, ui }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);

  async function handleVerify() {
    setBusy(true);
    setFailed(null);
    try {
      const ok = await onVerify();
      if (!ok) setFailed(ui.captchaFailed);
    } catch (e) {
      setFailed(e?.message || ui.captchaFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="state state--captcha">
      <h2 class="state__title">{ui.captchaTitle}</h2>
      <p class="state__body">{ui.captchaBody}</p>
      <div class="state__actions">
        <button
          type="button"
          class="state__cta"
          onClick={handleVerify}
          disabled={busy}
        >
          {busy ? ui.loading : ui.captchaVerify}
        </button>
        <button type="button" class="state__secondary" onClick={onOpenSettings}>
          {ui.openSettings}
        </button>
      </div>
      {failed && <p class="state__footnote">{failed}</p>}
    </div>
  );
}
