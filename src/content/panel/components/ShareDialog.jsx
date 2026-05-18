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
  const inFlight = status === 'publishing';
  return (
    <div class="share-dialog" role="dialog" aria-label={ui.share}>
      {status === 'success' ? (
        <>
          <h3 class="share-dialog__title">{ui.shareSuccess}</h3>
          <p class="share-dialog__body">{ui.shareSuccessHint}</p>
          <div class="share-dialog__url" title={shareUrl}>{shareUrl}</div>
          <div class="share-dialog__actions">
            <button type="button" class="state__cta" onClick={onCopy}>
              {ui.shareCopyAgain}
            </button>
            <button type="button" class="state__secondary" onClick={onClose}>
              {ui.close}
            </button>
          </div>
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
