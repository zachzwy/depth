import { describe, it, expect } from 'vitest';
import { computeStats } from '../../src/content/readability-stats.js';

describe('computeStats', () => {
  it('returns em-dashes for empty input', () => {
    expect(computeStats('').scale).toBe('—');
  });

  it('produces a non-negative grade score for typical English prose', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. ' +
      'Then it sits down and stares at a passing cloud. ' +
      'The cloud is shaped like a question mark.';
    const stats = computeStats(text);
    expect(stats.scale).toMatch(/^\d+\.\d$/);
    expect(parseFloat(stats.scale)).toBeGreaterThanOrEqual(0);
    expect(stats.level).toMatch(/^≈-?\d+$/);
  });

  it('handles a single sentence', () => {
    const stats = computeStats('Hello there friend.');
    expect(stats.scale).toMatch(/^\d+\.\d$/);
  });
});
