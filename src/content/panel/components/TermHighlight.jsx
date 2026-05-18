const TERM_TOKEN = /\[\[term:(\d+)\]\]([^[]+)\[\[\/term\]\]|\[\[term:(\d+)\|([^\]]+)\]\]/g;
const WIKI_LINK_TOKEN = /\[\[(?!term:\d+\|)([^\]|]+)\|([^\]]+)\]\]/g;

export function renderWithTerms(text, terms) {
  if (!text) return null;
  const cleaned = stripUnsupportedTermMarkup(text);
  if (!terms || terms.length === 0) return cleaned;

  const out = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of cleaned.matchAll(TERM_TOKEN)) {
    const start = match.index;
    if (start > lastIndex) {
      out.push(cleaned.slice(lastIndex, start));
    }
    const slot = Number(match[1] ?? match[3]);
    const label = match[2] ?? match[4];
    const term = terms[slot];
    out.push(
      <span
        class="term"
        data-slot={slot % 8}
        title={term?.definition ?? label}
        key={`t-${key++}`}
      >
        {label}
      </span>,
    );
    lastIndex = start + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    out.push(cleaned.slice(lastIndex));
  }

  return out;
}

export function stripUnsupportedTermMarkup(text) {
  return text.replace(WIKI_LINK_TOKEN, '$2');
}

export default function TermHighlight({ text, terms }) {
  return <>{renderWithTerms(text, terms)}</>;
}
