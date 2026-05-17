const POSITIONS = { 1: 8.33, 2: 29.17, 3: 50, 4: 70.83, 5: 91.67 };

export default function DepthSlider({ levels, level, onChange, readyLevels, ui }) {
  const activePct = POSITIONS[level] ?? 50;

  return (
    <div class="slider" role="radiogroup" aria-label={ui.readingDepth}>
      <div class="slider__track" aria-hidden="true" />
      <div class="slider__fill" style={{ width: `${activePct}%` }} aria-hidden="true" />
      <div class="slider__thumb" style={{ left: `${activePct}%` }} aria-hidden="true" />
      {levels.map((l) => {
        const active = l.id === level;
        const ready = readyLevels?.has(l.id);
        const isLive = l.id === 5;
        const showPip = ready && !active;
        const pct = POSITIONS[l.id];
        return (
          <button
            key={l.id}
            type="button"
            class={`slider__notch ${active ? 'is-active' : ''}`}
            style={{ left: `${pct}%` }}
            onClick={() => onChange(l.id)}
            role="radio"
            aria-checked={active}
            aria-label={ui.levelAria(l.id, l.displayName, ready)}
          >
            <span class="slider__num">
              {l.number}
              {showPip && (
                <span
                  class={`slider__pip ${isLive ? 'is-live' : ''}`}
                  aria-hidden="true"
                />
              )}
            </span>
            <span class="slider__dot" />
            <span class="slider__name">{l.name}</span>
          </button>
        );
      })}
    </div>
  );
}
