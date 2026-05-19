// One-shot offer for the 30-day Pro trial. Surfaces in the panel right
// after a fresh signed-in whoami when settings.hostedTrialEligible is
// true. The dismissed flag is stored under depth:trial-offer-shown:<id>
// by the caller so subsequent sessions don't re-prompt — see Panel.jsx
// where this is rendered.
//
// CTA reuses the existing depth:open-checkout SW message; the server-side
// billing-service adds trial_period_days=30 automatically when the
// subject has no Stripe customer yet.

import { useState } from 'preact/hooks';

export default function TrialOfferModal({ onStart, onDismiss, ui }) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  async function handleStart() {
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await onStart();
      if (result && result.ok === false) {
        setErrorMessage(result.message || ui.trialOfferError);
        setSubmitting(false);
      }
      // On success the modal stays mounted until the parent unmounts it
      // (Stripe Checkout opens in a new tab; the panel keeps its current
      // state).
    } catch (err) {
      setErrorMessage(err?.message || ui.trialOfferError);
      setSubmitting(false);
    }
  }

  return (
    <div class="state state--trial-offer">
      <h2 class="state__title">{ui.trialOfferTitle}</h2>
      <p class="state__body">{ui.trialOfferBody}</p>
      <div class="state__actions">
        <button
          type="button"
          class="state__cta"
          onClick={handleStart}
          disabled={submitting}
        >
          {submitting ? ui.trialOfferStarting : ui.trialOfferStart}
        </button>
        <button type="button" class="state__secondary" onClick={onDismiss}>
          {ui.trialOfferDismiss}
        </button>
      </div>
      {errorMessage && <p class="state__footnote">{errorMessage}</p>}
    </div>
  );
}
