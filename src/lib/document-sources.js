export function isPdfUrl(url) {
  return documentSourceFromUrl(url)?.sourceType === 'pdf';
}

export function documentSourceFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (/\.pdf$/i.test(parsed.pathname) || parseArxivId(url) !== null) {
    return {
      kind: 'pdf',
      sourceType: 'pdf',
      label: 'PDF',
    };
  }

  if (parseGoogleDoc(url)) {
    return {
      kind: 'document',
      sourceType: 'google-doc',
      label: 'Google Doc',
    };
  }

  if (wordDocxCandidates(url).length > 0) {
    return {
      kind: 'document',
      sourceType: 'word-docx',
      label: 'Word document',
    };
  }

  if (epubCandidates(url).length > 0) {
    return {
      kind: 'document',
      sourceType: 'epub',
      label: 'EPUB',
    };
  }

  return null;
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

export function parseGoogleDoc(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'docs.google.com') return null;

  const published = parsed.pathname.match(/^\/document\/d\/e\/([^/]+)\/pub/);
  if (published) {
    return { id: published[1], published: true };
  }

  const regular = parsed.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([^/]+)/);
  if (regular) {
    return { id: regular[1], published: false };
  }

  return null;
}

export function googleDocTextCandidates(url) {
  const doc = parseGoogleDoc(url);
  if (!doc) return [];
  if (doc.published) {
    return [
      {
        url: `https://docs.google.com/document/d/e/${doc.id}/pub?output=txt`,
        label: 'Google Docs published text',
      },
    ];
  }
  return [
    {
      url: `https://docs.google.com/document/d/${doc.id}/export?format=txt`,
      label: 'Google Docs text',
    },
  ];
}

export function wordDocxCandidates(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  const candidates = [];
  if (/\.docx$/i.test(parsed.pathname)) {
    candidates.push({ url: parsed.href, label: 'Word document' });
  }

  for (const value of parsed.searchParams.values()) {
    if (!value) continue;
    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      // Keep the original value.
    }
    if (looksLikeDocxUrl(decoded)) {
      candidates.push({ url: decoded, label: 'Word document' });
    }
  }

  return dedupeCandidates(candidates);
}

export function epubCandidates(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  if (!looksLikeEpubPath(parsed.pathname)) return [];
  return [{ url: parsed.href, label: 'EPUB' }];
}

function looksLikeEpubPath(pathname) {
  return /\.epub(?:3)?(?:[._-](?:images|noimages))?$/i.test(pathname);
}

function looksLikeDocxUrl(value) {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return /\.docx$/i.test(parsed.pathname) || /\.docx(?:[/?#]|$)/i.test(value);
  } catch {
    return false;
  }
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}
