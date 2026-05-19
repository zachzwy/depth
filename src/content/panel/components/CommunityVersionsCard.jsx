// Banner shown above the slider when one or more community versions
// of the current URL have been published. Offers two paths:
//
//   - Use latest (saves your quota) — hydrates the panel from the
//     newest published payload at zero generation cost.
//   - Generate fresh — proceeds with the normal level-1-3 call.
//
// `status` reflects what the panel is doing in response to the user's
// choice: 'available' is the default actionable state; 'hydrating'
// disables the buttons while we fetch the slug; 'using' shows a
// post-hydration notice the user can dismiss to fall back to
// generation if they're unhappy with the cached version.

export default function CommunityVersionsCard({
  status,
  count,
  onUseLatest,
  onGenerateFresh,
  ui,
}) {
  if (status === 'using') {
    return (
      <div class="community-card community-card--using">
        <p class="community-card__notice">
          {ui.communityHydratedPrefix}
          <a
            class="community-card__link"
            href="https://depth.microfalls.com/community"
            target="_blank"
            rel="noopener noreferrer"
          >
            {ui.communityHydratedLink}
          </a>
          {ui.communityHydratedSuffix}
        </p>
        <div class="community-card__actions">
          <button
            type="button"
            class="community-card__action community-card__action--secondary"
            onClick={onGenerateFresh}
          >
            {ui.communityGenerateFresh}
          </button>
        </div>
      </div>
    );
  }

  const inFlight = status === 'hydrating';
  const headline =
    count === 1 ? ui.communityAvailableOne : ui.communityAvailableMany(count);
  return (
    <div class="community-card community-card--available">
      <div class="community-card__headline">
        <span class="community-card__pip" aria-hidden="true" />
        <span>{headline}</span>
      </div>
      <div class="community-card__actions">
        <button
          type="button"
          class="community-card__action community-card__action--primary"
          onClick={onUseLatest}
          disabled={inFlight}
        >
          {inFlight ? ui.communityHydrating : ui.communityUseLatest}
        </button>
        <button
          type="button"
          class="community-card__action community-card__action--secondary"
          onClick={onGenerateFresh}
          disabled={inFlight}
        >
          {ui.communityGenerateFresh}
        </button>
      </div>
    </div>
  );
}
