export function isPdfUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return /\.pdf$/i.test(parsed.pathname) || parseArxivId(url) !== null;
}

export function parseArxivId(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'arxiv.org') return null;
  const match = parsed.pathname.match(/^\/pdf\/([A-Za-z-]+\/\d{7}|\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?$/);
  if (!match) return null;
  return `${match[1]}${match[2] ?? ''}`;
}

export function arxivHtmlCandidates(url) {
  const id = parseArxivId(url);
  if (!id) return [];
  return [
    {
      url: `https://ar5iv.labs.arxiv.org/html/${id}`,
      label: 'ar5iv HTML',
    },
  ];
}
