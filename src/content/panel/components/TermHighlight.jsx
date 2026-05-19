const TERM_TOKEN = /\[\[term:(\d+)\]\]([^[]+)\[\[\/term\]\]|\[\[term:(\d+)\|([^\]]+)\]\]/g;
const WIKI_LINK_TOKEN = /\[\[(?!term:\d+\|)([^\]|]+)\|([^\]]+)\]\]/g;

export function renderWithTerms(text, terms) {
  if (!text) return null;
  const cleaned = stripUnsupportedTermMarkup(text);
  if (!terms || terms.length === 0) return cleaned;
  const matches = [...cleaned.matchAll(TERM_TOKEN)];

  if (matches.length === 0) {
    return renderFallbackTermMatches(cleaned, terms);
  }

  const out = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of matches) {
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

function renderFallbackTermMatches(text, terms) {
  const matcher = buildTermLabelMatcher(terms);
  if (!matcher) return text;

  const out = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(matcher.regex)) {
    const prefix = match[1] ?? '';
    const label = match[2];
    const start = match.index + prefix.length;
    if (start > lastIndex) {
      out.push(text.slice(lastIndex, start));
    }
    const slot = matcher.slotFor(label);
    const term = terms[slot];
    out.push(
      <span
        class="term"
        data-slot={slot % 8}
        title={term?.definition ?? label}
        key={`tf-${key++}`}
      >
        {text.slice(start, start + label.length)}
      </span>,
    );
    lastIndex = start + label.length;
  }

  if (lastIndex === 0) return text;
  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }
  return out;
}

export function findRenderableTermSlots(text, terms) {
  if (!text || !terms || terms.length === 0) return new Set();
  const cleaned = stripUnsupportedTermMarkup(text);
  const tokenMatches = [...cleaned.matchAll(TERM_TOKEN)];
  if (tokenMatches.length > 0) {
    return new Set(
      tokenMatches
        .map((match) => Number(match[1] ?? match[3]))
        .filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < terms.length),
    );
  }

  const matcher = buildTermLabelMatcher(terms);
  if (!matcher) return new Set();
  return new Set([...cleaned.matchAll(matcher.regex)].map((match) => matcher.slotFor(match[2])));
}

function buildTermLabelMatcher(terms) {
  const entries = terms
    .map((term, slot) => ({ label: term?.label?.trim(), slot }))
    .filter(({ label }) => label && label.length >= 3)
    .sort((a, b) => b.label.length - a.label.length);

  if (entries.length === 0) return null;

  const slotByLabel = new Map(entries.map(({ label, slot }) => [label.toLowerCase(), slot]));
  return {
    regex: new RegExp(`(^|[^A-Za-z0-9_])(${entries.map(({ label }) => escapeRegExp(label)).join('|')})(?=$|[^A-Za-z0-9_])`, 'gi'),
    slotFor(label) {
      return slotByLabel.get(label.toLowerCase()) ?? 0;
    },
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function TermHighlight({ text, terms }) {
  return <>{renderWithTerms(text, terms)}</>;
}
