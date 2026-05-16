function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return word.length > 0 ? 1 : 0;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

export function computeStats(text) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || sentences.length === 0) {
    return { scale: '—', level: '—' };
  }
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
  const ease = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);

  return {
    scale: Math.max(0, grade).toFixed(1),
    level: `≈${Math.max(0, Math.round(ease))}`,
  };
}
