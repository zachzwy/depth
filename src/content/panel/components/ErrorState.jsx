const FRIENDLY = {
  NO_API_KEY: 'Model provider settings are incomplete. Open settings to finish setup.',
  NO_CONTENT: "Couldn't find readable article content on this page.",
  EMPTY_RESPONSE: 'The model returned nothing. Try again?',
  API_ERROR: 'The API call failed.',
  SETTINGS_READ_FAILED: 'Could not read settings.',
};

export default function ErrorState({ error, onRetry }) {
  const friendly = FRIENDLY[error?.code] ?? 'Something went wrong.';
  return (
    <div class="state state--error">
      <h2 class="state__title">{friendly}</h2>
      {error?.message && <pre class="state__detail">{error.message}</pre>}
      {onRetry && (
        <button type="button" class="state__cta" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
