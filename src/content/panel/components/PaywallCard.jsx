// Rendered in place of the generic ErrorState when the hosted backend returns
// LIMIT_REACHED. Gives the user two real paths instead of a dead-end:
//   1. Upgrade — opens the backend-supplied upgradeUrl in a new tab.
//   2. Use your own key — flips providerMode to 'custom' and opens settings.
// The BYOK escape valve is the asymmetric UX lever for hosted: most paywalls
// can't offer it because they don't have a BYOK path. Depth does.

export default function PaywallCard({ error, onUseOwnKey, ui }) {
  const upgradeUrl = error?.upgradeUrl;

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
