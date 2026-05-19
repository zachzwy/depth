const FRIENDLY_KEYS = {
  NO_API_KEY: 'noApiKey',
  NO_PROVIDER_CONSENT: 'noProviderConsent',
  NO_CONTENT: 'noContent',
  EMPTY_RESPONSE: 'emptyResponse',
  API_ERROR: 'apiError',
  SETTINGS_READ_FAILED: 'settingsReadFailed',
  SCANNED_PDF_UNSUPPORTED: 'scannedPdfUnsupported',
  PDF_TEXT_TOO_SHORT: 'pdfTextTooShort',
  PDF_EXTRACT_FAILED: 'documentExtractFailed',
  DOCUMENT_EXTRACT_FAILED: 'documentExtractFailed',
};

export default function ErrorState({ error, onRetry, ui }) {
  const friendly = ui[FRIENDLY_KEYS[error?.code]] ?? ui.genericError;
  return (
    <div class="state state--error">
      <h2 class="state__title">{friendly}</h2>
      {error?.message && <pre class="state__detail">{error.message}</pre>}
      {onRetry && (
        <button type="button" class="state__cta" onClick={onRetry}>
          {ui.tryAgain}
        </button>
      )}
    </div>
  );
}
