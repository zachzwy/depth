// Rendered in place of the generic ErrorState when the hosted backend returns
// LIMIT_REACHED. Gives the user two real paths instead of a dead-end:
//   1. Upgrade — for signed-in users, kicks off a Stripe Checkout via
//      onUpgrade (returns true if it handled the click); for anonymous
//      users (onUpgrade returns false) falls back to the static upgradeUrl
//      anchor so they land on the marketing page where they can sign in.
//   2. Use your own key — flips providerMode to 'custom' and opens settings.
// The BYOK escape valve is the asymmetric UX lever for hosted: most paywalls
// can't offer it because they don't have a BYOK path. Depth does.

export default function PaywallCard({ error, onUseOwnKey, onUpgrade, ui }) {
  const upgradeUrl = error?.upgradeUrl;

  async function handleUpgradeClick(e) {
    if (typeof onUpgrade !== 'function') return; // anchor default proceeds
    // Call onUpgrade; if it handled the click (signed-in Stripe Checkout),
    // suppress the anchor's default. Anything else lets the static link run.
    const handled = await onUpgrade();
    if (handled) e.preventDefault();
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
