// Banner shown above the slider when one or more community versions
// of the current URL have been published.
//
// Three render modes:
//   1. `versions.length <= 1` (or no versions array) — the classic
//      two-button card: "Use latest" / "Generate fresh".
//   2. `versions.length > 1` and no selectedSlug — a stacked list of
//      versions (created date + view count) with radio selection plus a
//      primary "Use selected" button and a "Generate fresh" fallback.
//   3. `status === 'using'` — compact strip with prev/next to step
//      between published versions, plus "Generate fresh".
//
// `status` reflects what the panel is doing in response to the user's
// choice: 'available' is the default actionable state; 'hydrating'
// disables the buttons while we fetch the slug; 'using' shows the
// compact strip above the content area.

import { useState } from 'preact/hooks';

function formatVersionDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CommunityVersionsCard({
  status,
  count,
  versions,
  selectedSlug,
  onUseLatest,
  onSelectVersion,
  onGenerateFresh,
  ui,
}) {
  const list = Array.isArray(versions) ? versions : [];

  // ---- Mode 3: post-hydration compact strip ----
  if (status === 'using') {
    const i = Math.max(0, list.findIndex((v) => v.slug === selectedSlug));
    const total = list.length;
    const hasPrev = total > 1 && i < total - 1; // older
    const hasNext = total > 1 && i > 0;          // newer

    function step(delta) {
      const target = list[i + delta];
      if (target?.slug) onSelectVersion?.(target.slug);
    }

    return (
      <div class="community-card community-card--using">
        {total > 1 && (
          <div class="community-card__switcher">
            <button
              type="button"
              class="community-card__step"
              onClick={() => step(1)}
              disabled={!hasPrev}
              aria-label={ui.prevVersion ?? 'Previous version'}
            >
              ‹ {ui.prevVersion ?? 'prev'}
            </button>
            <span class="community-card__position">
              {ui.versionOfN ? ui.versionOfN(i + 1, total) : `Version ${i + 1} of ${total}`}
            </span>
            <button
              type="button"
              class="community-card__step"
              onClick={() => step(-1)}
              disabled={!hasNext}
              aria-label={ui.nextVersion ?? 'Next version'}
            >
              {ui.nextVersion ?? 'next'} ›
            </button>
          </div>
        )}
        <p class="community-card__notice">
          {ui.communityHydratedPrefix}
          <a
            class="community-card__link"
            href="https://depth.productivities.fyi/community"
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

  // ---- Mode 2: list-with-radio chooser when multiple versions exist ----
  if (list.length > 1) {
    return <VersionPicker
      list={list}
      inFlight={inFlight}
      onSelectVersion={onSelectVersion}
      onGenerateFresh={onGenerateFresh}
      ui={ui}
    />;
  }

  // ---- Mode 1: classic two-button card ----
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

function VersionPicker({ list, inFlight, onSelectVersion, onGenerateFresh, ui }) {
  // Default selection is the newest (versions are ordered DESC by
  // created_at on the server). The user can pick a different version
  // before clicking the primary button.
  const [picked, setPicked] = useState(list[0]?.slug ?? '');
  const headline = ui.communityAvailableMany(list.length);

  function pick() {
    if (!picked) return;
    onSelectVersion?.(picked);
  }

  return (
    <div class="community-card community-card--available community-card--list">
      <div class="community-card__headline">
        <span class="community-card__pip" aria-hidden="true" />
        <span>{headline}</span>
      </div>
      <ul class="community-card__versions">
        {list.map((v) => {
          const n = Number(v.viewCount ?? 0);
          const id = `dpv-${v.slug}`;
          return (
            <li class="community-card__version">
              <label class="community-card__version-row" for={id}>
                <input
                  id={id}
                  type="radio"
                  name="depth-community-version"
                  value={v.slug}
                  checked={picked === v.slug}
                  onChange={() => setPicked(v.slug)}
                  disabled={inFlight}
                />
                <span class="community-card__version-meta">
                  <span class="community-card__version-date">{formatVersionDate(v.createdAt)}</span>
                  <span class="community-card__version-views">
                    {n} {n === 1 ? (ui.viewsSingular ?? 'view') : (ui.viewsPlural ?? 'views')}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div class="community-card__actions">
        <button
          type="button"
          class="community-card__action community-card__action--primary"
          onClick={pick}
          disabled={inFlight || !picked}
        >
          {inFlight ? ui.communityHydrating : (ui.pickVersion ?? 'Use selected version')}
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
