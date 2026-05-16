export default function StaleBanner({ onReload, onDismiss }) {
  return (
    <div class="stale-banner" role="status">
      <span class="stale-banner__text">Page changed — re-read this URL?</span>
      <div class="stale-banner__actions">
        <button type="button" class="stale-banner__cta" onClick={onReload}>
          Re-read
        </button>
        <button type="button" class="stale-banner__dismiss" aria-label="Dismiss" onClick={onDismiss}>
          ✕
        </button>
      </div>
    </div>
  );
}
