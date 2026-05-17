export default function StaleBanner({ onReload, onDismiss, ui }) {
  return (
    <div class="stale-banner" role="status">
      <span class="stale-banner__text">{ui.pageChanged}</span>
      <div class="stale-banner__actions">
        <button type="button" class="stale-banner__cta" onClick={onReload}>
          {ui.reread}
        </button>
        <button type="button" class="stale-banner__dismiss" aria-label={ui.dismiss} onClick={onDismiss}>
          ✕
        </button>
      </div>
    </div>
  );
}
