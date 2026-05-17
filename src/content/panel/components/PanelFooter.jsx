export default function PanelFooter({ onClose, onSave, onShare, canSave = false, flash = false, ui }) {
  return (
    <footer class="panel-footer">
      <button
        type="button"
        class="panel-footer__save"
        onClick={onSave}
        disabled={!canSave}
        aria-disabled={!canSave}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <span>{flash ? ui.saved : ui.saveToDeck}</span>
      </button>
      <div class="panel-footer__spacer" />
      <button type="button" class="icon-btn" aria-label={ui.share} onClick={onShare}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </button>
      <button type="button" class="icon-btn" aria-label={ui.close} onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </footer>
  );
}
