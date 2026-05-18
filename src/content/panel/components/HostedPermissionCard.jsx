// Rendered when streamHosted refuses because the user hasn't yet granted
// Chrome's optional host permission for the hosted backend. One click
// here triggers chrome.permissions.request in the service worker — the
// user gesture from this button carries through chrome.runtime.sendMessage
// — so the Chrome consent dialog appears without sending the user to the
// settings page.

import { useState } from 'preact/hooks';

export default function HostedPermissionCard({ onAllow, onOpenSettings, ui }) {
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  async function handleAllow() {
    setBusy(true);
    setDenied(false);
    try {
      const granted = await onAllow();
      if (!granted) setDenied(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="state state--permission">
      <h2 class="state__title">{ui.hostedPermissionTitle}</h2>
      <p class="state__body">{ui.hostedPermissionBody}</p>
      <div class="state__actions">
        <button
          type="button"
          class="state__cta"
          onClick={handleAllow}
          disabled={busy}
        >
          {busy ? ui.loading : ui.hostedPermissionAllow}
        </button>
        <button type="button" class="state__secondary" onClick={onOpenSettings}>
          {ui.openSettings}
        </button>
      </div>
      {denied && <p class="state__footnote">{ui.hostedPermissionDenied}</p>}
    </div>
  );
}
