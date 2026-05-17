// Rendered in place of the generic ErrorState when the hosted backend returns
// LIMIT_REACHED. Gives the user two real paths instead of a dead-end:
//   1. Upgrade — for signed-in users, kicks off a Stripe Checkout via
//      onUpgrade and suppresses the anchor's default; for anonymous users
//      we fall through to the static upgradeUrl anchor so they land on the
//      marketing page where they can sign in.
//   2. Use your own key — flips providerMode to 'custom' and opens settings.
// The BYOK escape valve is the asymmetric UX lever for hosted: most paywalls
// can't offer it because they don't have a BYOK path. Depth does.
//
// The `canUpgrade` prop is consulted *synchronously* during the click handler
// — we have to decide whether to preventDefault before yielding, otherwise
// Chrome opens the anchor target in a new tab AND we also open a Stripe tab.

export default function PaywallCard({ error, onUseOwnKey, onUpgrade, canUpgrade, ui }) {
  const upgradeUrl = error?.upgradeUrl;

  function handleUpgradeClick(e) {
    if (typeof onUpgrade !== 'function' || !canUpgrade) {
      // Anonymous user (or no upgrade handler at all) — let the anchor
      // navigate to the marketing page where they can sign in.
      return;
    }
    e.preventDefault();
    // Fire-and-forget. onUpgrade is responsible for surfacing any error
    // (typically by opening the Stripe tab if the API call succeeded, or
    // by logging if it didn't).
    Promise.resolve(onUpgrade()).catch((err) => {
      console.warn('[Depth panel] upgrade failed:', err?.message);
    });
  }

  return (
    <div class="state state--paywall">
      <h2 class="state__title">{ui.paywallTitle}</h2>
      <p class="state__body">{error?.message ?? ui.paywallBody}</p>
      <div class="state__actions">
        {upgradeUrl && (
          <a
            class="state__cta"
            href={upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleUpgradeClick}
          >
            {ui.paywallUpgrade}
          </a>
        )}
        <button type="button" class="state__secondary" onClick={onUseOwnKey}>
          {ui.paywallBringKey}
        </button>
      </div>
      <p class="state__footnote">{ui.paywallBringKeyHint}</p>
    </div>
  );
}
