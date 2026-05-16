export default function DepthSlider({ levels, level, onChange, readyLevels }) {
  const fillPct = ((level - 1) / (levels.length - 1)) * 100;

  return (
    <div class="slider" role="radiogroup" aria-label="Reading depth">
      <div class="slider__track">
        <div class="slider__line" />
        <div class="slider__line-fill" style={{ width: `${fillPct}%` }} />
        {levels.map((l) => {
          const active = l.id === level;
          const ready = readyLevels?.has(l.id);
          const isLive = l.id === 5;
          const showPip = ready && !active;
          return (
            <button
              key={l.id}
              type="button"
              class={`slider__stop ${active ? 'is-active' : ''}`}
              onClick={() => onChange(l.id)}
              role="radio"
              aria-checked={active}
              aria-label={`Level ${l.id}: ${l.displayName}${ready ? ' (ready)' : ''}`}
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
    </div>
  );
}
