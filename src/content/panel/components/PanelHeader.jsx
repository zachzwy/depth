export default function PanelHeader({
  title,
  onClose,
  onOpenSettings,
  onRegenerate,
  onShare,
  canRegenerate = false,
  canShare = false,
  shareTitle,
  dragHandlers,
  ui,
}) {
  const truncated = title && title.length > 36 ? title.slice(0, 36) + '…' : title;

  return (
    <header class="panel-header" {...(dragHandlers ?? {})}>
      <div class="panel-header__brand">
        <svg
          class="panel-header__logo"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="4" y="6.5" width="16" height="2.5" rx="1.25" fill="#b8a8e6" />
          <rect x="4" y="10.75" width="12" height="2.5" rx="1.25" fill="#e8a87c" />
          <rect x="4" y="15" width="8" height="2.5" rx="1.25" fill="#8cc4d6" />
        </svg>
        <span class="panel-header__name">Depth</span>
      </div>
      <div class="panel-header__title" title={title}>
        {truncated}
      </div>
      <div class="panel-header__actions">
        <button
          type="button"
          class="icon-btn"
          aria-label={ui.regenerate}
          title={ui.regenerateTitle}
          onClick={onRegenerate}
          disabled={!canRegenerate}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label={ui.share}
          title={shareTitle ?? ui.share}
          onClick={onShare}
          disabled={!canShare}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label={ui.settings}
          title={ui.settings}
          onClick={onOpenSettings}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button type="button" class="icon-btn" aria-label={ui.close} onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </header>
  );
}
