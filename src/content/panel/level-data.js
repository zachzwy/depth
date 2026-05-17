export function countTermRefs(text) {
  if (!text) return 0;
  return (text.match(/\[\[term:/g) ?? []).length;
}

export function stripTermTokens(text) {
  if (!text) return '';
  return text
    .replace(/\[\[term:\d+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[term:\d+\]\]([^[]+)\[\[\/term\]\]/g, '$1');
}

export function glanceData(d) {
  return {
    glance: d?.glance?.sentence ?? '',
    confidence: d?.glance?.confidence ?? 'medium',
    termCount: d?.keyTerms?.length ?? 0,
    highlightedIndex: countTermRefs(d?.glance?.sentence),
    terms: d?.keyTerms ?? [],
    sectionsUsed: d?.read?.sections?.length ?? 0,
  };
}

export function summaryData(d) {
  return {
    bullets: d?.summary?.bullets ?? [],
    terms: d?.keyTerms ?? [],
  };
}

export function readData(d, stats, extractedText) {
  const base = stats ?? { scale: '—' };
  const originalLen = extractedText?.length ?? 0;
  const readLen = (d?.read?.sections ?? []).reduce(
    (sum, s) => sum + (s.paragraphs ?? []).reduce((ss, p) => ss + (p?.length ?? 0), 0),
    0,
  );
  const trimmed =
    originalLen > 0 && readLen > 0
      ? `~${Math.max(0, Math.round((1 - readLen / originalLen) * 100))}%`
      : '—';
  return {
    stats: { scale: base.scale, trimmed, terms: d?.keyTerms?.length ?? 0 },
    sections: d?.read?.sections ?? [],
    terms: d?.keyTerms ?? [],
  };
}
