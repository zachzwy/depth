import { useState } from 'preact/hooks';

export default function ConsentModal({ extracted, pageMeta, onAccept, onClose }) {
  const [showPayload, setShowPayload] = useState(false);
  return (
    <div class="state state--consent">
      <h2 class="state__title">Send this page to Anthropic?</h2>
      <p class="state__body">
        Depth will send the extracted article text plus the page title and URL to Anthropic's API
        using your key. Nothing else leaves your browser.
      </p>
      <button
        type="button"
        class="state__link"
        onClick={() => setShowPayload((v) => !v)}
      >
        {showPayload ? 'Hide preview' : 'Show what will be sent'}
      </button>
      {showPayload && (
        <pre class="state__payload">{
`Title: ${extracted.title}
URL: ${pageMeta.url}

${extracted.text.slice(0, 800)}${extracted.text.length > 800 ? '\n…' : ''}`
        }</pre>
      )}
      <div class="state__actions">
        <button type="button" class="state__cta" onClick={onAccept}>
          Continue
        </button>
        <button type="button" class="state__secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
