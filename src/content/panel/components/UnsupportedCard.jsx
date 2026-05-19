import ExtractionStats from './ExtractionStats.jsx';

export default function UnsupportedCard({ extracted, onTryAnyway, ui }) {
  const kind = extracted?.classification?.kind ?? 'unsupported';
  const titleKey =
    kind === 'media' && extracted?.classification?.reason === 'transcript-required'
      ? 'mediaTranscriptRequired'
      : kind === 'unsupported' && extracted?.classification?.reason === 'text-not-article'
      ? 'textNotArticle'
      : kind;
  const title = ui.unsupportedTitle?.[titleKey] ?? ui.unsupportedTitle?.unsupported;
  const body = ui.unsupportedBody?.[titleKey] ?? ui.unsupportedBody?.unsupported;
  const canTryAnyway = onTryAnyway && extracted?.classification?.reason !== 'transcript-required';
  return (
    <div class="state state--unsupported">
      <h2 class="state__title">{title}</h2>
      <p class="state__body">{body}</p>
      <ExtractionStats extracted={extracted} ui={ui} />
      {canTryAnyway && (
        <button type="button" class="state__link" onClick={onTryAnyway}>
          {ui.tryAnyway}
        </button>
      )}
    </div>
  );
}
