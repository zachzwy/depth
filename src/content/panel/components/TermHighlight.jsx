const TERM_TOKEN = /\[\[term:(\d+)\]\]([^[]+)\[\[\/term\]\]|\[\[term:(\d+)\|([^\]]+)\]\]/g;

export function renderWithTerms(text, terms) {
  if (!text) return null;
  if (!terms || terms.length === 0) return text;

  const out = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(TERM_TOKEN)) {
    const start = match.index;
    if (start > lastIndex) {
      out.push(text.slice(lastIndex, start));
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

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }

  return out;
}

export default function TermHighlight({ text, terms }) {
  return <>{renderWithTerms(text, terms)}</>;
}
