import { describe, it, expect } from 'vitest';
import { LEVELS, getLevel } from '../../src/lib/levels.js';

describe('levels', () => {
  it('defines exactly five depth levels', () => {
    expect(LEVELS).toHaveLength(5);
    expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('getLevel returns the matching level', () => {
    expect(getLevel(3).name).toBe('Read');
    expect(getLevel(5).displayName).toBe('Deep Dive');
  });

  it('falls back to the first level for an unknown id', () => {
    expect(getLevel(99)).toBe(LEVELS[0]);
    expect(getLevel(undefined)).toBe(LEVELS[0]);
  });
});
