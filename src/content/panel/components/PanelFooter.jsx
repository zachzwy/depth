export default function PanelFooter({ onSave, onUnsave, onOpenDeck, canSave = false, isSaved = false, ui }) {
  const showSaved = isSaved;
  const enabled = showSaved || canSave;
  return (
    <footer class="panel-footer">
      <button
        type="button"
        class={`panel-footer__save${showSaved ? ' is-saved' : ''}`}
        onClick={showSaved ? onUnsave : onSave}
        disabled={!enabled}
        aria-disabled={!enabled}
        title={showSaved ? (ui.unsave ?? 'Click to remove from deck') : undefined}
      >
        {showSaved ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        )}
        <span>{showSaved ? ui.saved : ui.saveToDeck}</span>
      </button>
      <div class="panel-footer__spacer" />
      <button
        type="button"
        class="icon-btn"
        aria-label={ui.openDeck ?? 'Open deck'}
        title={ui.openDeck ?? 'Open deck'}
        onClick={onOpenDeck}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="3" y="6" width="14" height="14" rx="2" />
          <path d="M7 6V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2" />
        </svg>
      </button>
    </footer>
  );
}
