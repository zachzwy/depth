// Rendered in place of the generic ErrorState when the hosted backend returns
// LIMIT_REACHED. Gives the user two real paths instead of a dead-end:
//   1. Upgrade (signed-in) / Sign in (anonymous) — for signed-in users this
//      kicks off a Stripe Checkout via onUpgrade and suppresses the anchor's
//      default; for anonymous users we render a Sign in button instead that
//      launches the Google sign-in flow via onSignIn so signing in restores
//      quota without leaving the panel.
//   2. Use your own key — flips providerMode to 'custom' and opens settings.
// The BYOK escape valve is the asymmetric UX lever for hosted: most paywalls
// can't offer it because they don't have a BYOK path. Depth does.
//
// The `canUpgrade` prop is consulted *synchronously* during the click handler
// — we have to decide whether to preventDefault before yielding, otherwise
// Chrome opens the anchor target in a new tab AND we also open a Stripe tab.

export default function PaywallCard({
  error,
  onUseOwnKey,
  onUpgrade,
  onSignIn,
  canUpgrade,
  // True when the signed-in user has never had a Stripe customer. Swaps
  // the title and CTA copy to the trial-flavored version; the click
  // handler is unchanged because the server decides paid vs trial on
  // the same checkout call.
  trialEligible,
  ui,
}) {
  const upgradeUrl = error?.upgradeUrl;
  const showTrialCopy = canUpgrade && trialEligible;

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

  function handleSignInClick() {
    if (typeof onSignIn !== 'function') return;
    Promise.resolve(onSignIn()).catch((err) => {
      console.warn('[Depth panel] sign-in failed:', err?.message);
    });
  }

  let title;
  let body;
  let upgradeLabel;
  if (showTrialCopy) {
    title = ui.paywallTrialTitle;
    body = ui.paywallTrialBody;
    upgradeLabel = ui.paywallTrialStart;
  } else if (canUpgrade) {
    title = ui.paywallTitle;
    body = error?.message ?? ui.paywallBody;
    upgradeLabel = ui.paywallUpgrade;
  } else {
    title = ui.paywallTitle;
    body = ui.paywallSignInBody;
    upgradeLabel = null;
  }

  return (
    <div class="state state--paywall">
      <h2 class="state__title">{title}</h2>
      <p class="state__body">{body}</p>
      <div class="state__actions">
        {canUpgrade
          ? upgradeUrl && (
              <a
                class="state__cta"
                href={upgradeUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleUpgradeClick}
              >
                {upgradeLabel}
              </a>
            )
          : (
              <button type="button" class="state__cta" onClick={handleSignInClick}>
                {ui.paywallSignIn}
              </button>
            )}
        <button type="button" class="state__secondary" onClick={onUseOwnKey}>
          {ui.paywallBringKey}
        </button>
      </div>
      <p class="state__footnote">{ui.paywallBringKeyHint}</p>
    </div>
  );
}
