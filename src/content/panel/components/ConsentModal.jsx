import { useState } from 'preact/hooks';

export default function ConsentModal({ extracted, pageMeta, provider, model, onAccept, onClose, ui }) {
  const [showPayload, setShowPayload] = useState(false);
  const providerLabel = provider?.label ?? ui.modelProvider;
  return (
    <div class="state state--consent">
      <h2 class="state__title">{ui.consentTitle(providerLabel)}</h2>
      <p class="state__body">{ui.consentBody(providerLabel, model)}</p>
      <button
        type="button"
        class="state__link"
        onClick={() => setShowPayload((v) => !v)}
      >
        {showPayload ? ui.hidePayload : ui.showPayload}
      </button>
      {showPayload && (
        <pre class="state__payload">{
`${ui.titleLabel}: ${extracted.title}
${ui.urlLabel}: ${pageMeta.url}

${extracted.text.slice(0, 800)}${extracted.text.length > 800 ? '\n…' : ''}`
        }</pre>
      )}
      <div class="state__actions">
        <button type="button" class="state__cta" onClick={onAccept}>
          {ui.continue}
        </button>
        <button type="button" class="state__secondary" onClick={onClose}>
          {ui.cancel}
        </button>
      </div>
    </div>
  );
}
