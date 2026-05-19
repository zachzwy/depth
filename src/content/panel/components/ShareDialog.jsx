// Inline overlay dialog for the Share button. Three modes driven by `status`:
//   - 'consent'    → first-time publish: Publish / Always publish / Cancel
//   - 'publishing' → in flight, buttons disabled
//   - 'success'    → shows the share URL + Copy link + Close
//   - 'error'      → shows the error message + Try again + Cancel
//
// `consentRequired` distinguishes the first publish from a subsequent
// one (e.g. user clicked Share again after copying the link). When
// consent is not required we skip the body copy block since the user
// already opted in once.

import { useEffect, useRef, useState } from 'preact/hooks';

const COPIED_FEEDBACK_MS = 1400;

export default function ShareDialog({
  status,
  consentRequired,
  shareUrl,
  errorMessage,
  onConfirm,
  onAlways,
  onCopy,
  onClose,
  ui,
}) {
  // Brief "Copied ✓" feedback after Copy-link is clicked. Without this
  // the only sign the click did anything was the silent clipboard
  // write — the user couldn't tell if they actually copied.
  const [justCopied, setJustCopied] = useState(false);
  const copiedTimeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(copiedTimeoutRef.current), []);

  function handleCopy() {
    onCopy?.();
    setJustCopied(true);
    clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setJustCopied(false), COPIED_FEEDBACK_MS);
  }

  function handleManageClick(e) {
    // Content scripts can't call chrome.runtime.openOptionsPage directly,
    // so we round-trip via the service worker.
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'depth:open-options' });
  }

  const inFlight = status === 'publishing';
  return (
    <div class="share-dialog" role="dialog" aria-label={ui.share}>
      {status === 'success' ? (
        <>
          <h3 class="share-dialog__title">{ui.shareSuccess}</h3>
          <p class="share-dialog__body">{ui.shareSuccessHint}</p>
          <div
            class={`share-dialog__url${justCopied ? ' is-just-copied' : ''}`}
            title={shareUrl}
          >
            {shareUrl}
          </div>
          <div class="share-dialog__actions">
            <button
              type="button"
              class={`state__cta${justCopied ? ' is-just-copied' : ''}`}
              onClick={handleCopy}
              aria-live="polite"
            >
              {justCopied ? ui.shareCopiedFeedback : ui.shareCopyAgain}
            </button>
            <button type="button" class="state__secondary" onClick={onClose}>
              {ui.close}
            </button>
          </div>
          <a
            href="#"
            class="share-dialog__manage"
            onClick={handleManageClick}
          >
            {ui.manageShares}
          </a>
        </>
      ) : status === 'error' ? (
        <>
          <h3 class="share-dialog__title">{ui.shareFailed}</h3>
          <p class="share-dialog__body">{errorMessage}</p>
          <div class="share-dialog__actions">
            <button type="button" class="state__cta" onClick={onConfirm}>
              {ui.tryAgain}
            </button>
            <button type="button" class="state__secondary" onClick={onClose}>
              {ui.cancel}
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 class="share-dialog__title">{ui.shareConsentTitle}</h3>
          {consentRequired && (
            <p class="share-dialog__body">{ui.shareConsentBody}</p>
          )}
          <div class="share-dialog__actions">
            <button
              type="button"
              class="state__cta"
              onClick={onConfirm}
              disabled={inFlight}
            >
              {ui.shareConfirm}
            </button>
            {consentRequired && (
              <button
                type="button"
                class="state__secondary"
                onClick={onAlways}
                disabled={inFlight}
              >
                {ui.shareAlways}
              </button>
            )}
            <button
              type="button"
              class="state__secondary"
              onClick={onClose}
              disabled={inFlight}
            >
              {ui.cancel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
