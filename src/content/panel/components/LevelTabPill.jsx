export default function LevelTabPill({ level, metaOverride }) {
  const meta = metaOverride ?? level.pillMeta;
  return (
    <div class="level-pill">
      <span class="level-pill__label">{level.pillLabel}</span>
      {meta && <span class="level-pill__meta">{meta}</span>}
    </div>
  );
}
