import { describe, it, expect } from 'vitest';
import {
  PROMPT_VERSION,
  SYSTEM_1_3,
  SYSTEM_QUIZ,
  SYSTEM_DIVE,
  buildUserMessage1_3,
  buildUserMessageQuiz,
  buildSystemDive,
} from '../../src/lib/prompts.js';

describe('PROMPT_VERSION', () => {
  it('is a non-empty string used in the content-hash', () => {
    expect(typeof PROMPT_VERSION).toBe('string');
    expect(PROMPT_VERSION.length).toBeGreaterThan(0);
  });
});

describe('buildUserMessage1_3', () => {
  const args = { title: 'Hello', url: 'https://x', text: 'Body.', preferredLanguage: 'English' };

  it('includes title, URL, and body', () => {
    const msg = buildUserMessage1_3(args);
    expect(msg).toContain('Hello');
    expect(msg).toContain('https://x');
    expect(msg).toContain('Body.');
    expect(msg).toContain('Source type: article');
    expect(msg).toContain('ARTICLE BEGIN');
    expect(msg).toContain('ARTICLE END');
  });

  it('uses transcript labels and instructions for transcript sources', () => {
    const msg = buildUserMessage1_3({ ...args, sourceKind: 'transcript' });
    expect(msg).toContain('Source type: transcript');
    expect(msg).toContain('Ignore timestamps');
    expect(msg).toContain('TRANSCRIPT BEGIN');
    expect(msg).toContain('TRANSCRIPT END');
  });

  it('embeds the English language instruction by default', () => {
    const msg = buildUserMessage1_3(args);
    expect(msg).toContain('Preferred output language: English');
  });

  it('routes generic Chinese to Simplified with the script-note steering', () => {
    const msg = buildUserMessage1_3({ ...args, preferredLanguage: 'Chinese' });
    expect(msg).toContain('Simplified Chinese (zh-Hans)');
    expect(msg).toMatch(/simplified.*never traditional/i);
  });

  it('routes Traditional Chinese to its own script-note', () => {
    const msg = buildUserMessage1_3({ ...args, preferredLanguage: 'zh-Hant' });
    expect(msg).toContain('Traditional Chinese (zh-Hant)');
    expect(msg).toMatch(/traditional.*never simplified/i);
  });

  it('passes through non-Chinese languages without a script-note', () => {
    const msg = buildUserMessage1_3({ ...args, preferredLanguage: 'Japanese' });
    expect(msg).toContain('Preferred output language: Japanese');
    expect(msg).not.toMatch(/simplified|traditional/i);
  });
});

describe('buildUserMessageQuiz', () => {
  it('formats the key-terms block when provided', () => {
    const msg = buildUserMessageQuiz({
      title: 'T',
      url: 'U',
      text: 'body',
      keyTerms: [{ label: 'alpha', definition: 'first' }, { label: 'beta', definition: 'second' }],
      preferredLanguage: 'English',
    });
    expect(msg).toContain('0. alpha: first');
    expect(msg).toContain('1. beta: second');
  });

  it('falls back when key terms are missing', () => {
    const msg = buildUserMessageQuiz({ title: 'T', url: 'U', text: 'body', keyTerms: [], preferredLanguage: 'English' });
    expect(msg).toContain('(none)');
  });

  it('uses transcript source framing for quiz prompts', () => {
    const msg = buildUserMessageQuiz({
      title: 'T',
      url: 'U',
      text: 'body',
      sourceKind: 'transcript',
      keyTerms: [],
      preferredLanguage: 'English',
    });
    expect(msg).toContain('Source type: transcript');
    expect(msg).toContain('TRANSCRIPT BEGIN');
  });
});

describe('buildSystemDive', () => {
  it('combines the system prompt with grounding info', () => {
    const sys = buildSystemDive({
      title: 'My Article',
      summary: {
        glance: { sentence: 'Central claim.' },
        summary: { bullets: ['point a', 'point b'] },
      },
      preferredLanguage: 'English',
    });
    expect(sys).toContain(SYSTEM_DIVE);
    expect(sys).toContain('Source title: My Article');
    expect(sys).toContain('Central claim.');
    expect(sys).toContain('- point a');
    expect(sys).toContain('- point b');
  });

  it('passes transcript source type into dive grounding', () => {
    const sys = buildSystemDive({
      title: 'My Transcript',
      summary: { glance: { sentence: 'Central claim.' }, summary: { bullets: [] } },
      sourceKind: 'transcript',
      preferredLanguage: 'English',
    });
    expect(sys).toContain('Source type: transcript');
    expect(sys).toContain('Source title: My Transcript');
  });

  it('handles missing glance and bullets gracefully', () => {
    const sys = buildSystemDive({
      title: 'T',
      summary: {},
      preferredLanguage: 'English',
    });
    // No throws, and the central-claim line is still present (empty).
    expect(sys).toContain('Central claim:');
  });

  it('handles a completely missing summary object', () => {
    const sys = buildSystemDive({ title: 'T', preferredLanguage: 'English' });
    expect(sys).toContain('Central claim:');
  });
});

describe('static system prompts', () => {
  it('are non-empty strings', () => {
    expect(SYSTEM_1_3.length).toBeGreaterThan(100);
    expect(SYSTEM_QUIZ.length).toBeGreaterThan(100);
    expect(SYSTEM_DIVE.length).toBeGreaterThan(100);
  });
});
