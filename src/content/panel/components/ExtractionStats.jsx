export default function ExtractionStats({ extracted, ui }) {
  if (!extracted) return null;
  const kind = extracted.classification?.kind ?? 'article';
  const kindLabel =
    kind === 'unsupported' && extracted.classification?.reason === 'text-not-article'
      ? (ui.extractKind?.textNotArticle ?? ui.extractKind?.unsupported ?? kind)
      : (ui.extractKind?.[kind] ?? kind);
  const showWords = (extracted.wordCount ?? 0) > 0;
  return (
    <div class="extraction-stats" aria-live="polite">
      {showWords && (
        <>
          <span class="extraction-stats__words">{ui.extractedWords(extracted.wordCount)}</span>
          <span class="extraction-stats__sep">·</span>
        </>
      )}
      <span class={`extraction-stats__kind extraction-stats__kind--${kind}`}>{kindLabel}</span>
    </div>
  );
}
