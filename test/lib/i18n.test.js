import { describe, it, expect } from 'vitest';
import {
  LANGUAGES,
  LANGUAGE_OPTIONS,
  resolveLanguageCode,
  getLanguage,
  getUi,
} from '../../src/lib/i18n/index.js';
import { en } from '../../src/lib/i18n/en.js';

describe('resolveLanguageCode', () => {
  it.each([
    ['English', 'en'],
    ['en', 'en'],
    ['', 'en'],
    [undefined, 'en'],
    ['unknown language', 'en'],
    ['Spanish', 'es'],
    ['Español', 'es'],
    ['es-MX', 'es'],
    ['French', 'fr'],
    ['Français', 'fr'],
    ['fr-CA', 'fr'],
    ['Japanese', 'ja'],
    ['日本語', 'ja'],
    ['ja-JP', 'ja'],
  ])('%j -> %s', (input, code) => {
    expect(resolveLanguageCode(input)).toBe(code);
  });

  it('routes Traditional Chinese variants to zh-Hant', () => {
    for (const v of ['Traditional Chinese', 'zh-Hant', 'zh-TW', 'zh-HK', '繁體中文']) {
      expect(resolveLanguageCode(v)).toBe('zh-Hant');
    }
  });

  it('routes Simplified Chinese variants to zh-Hans', () => {
    for (const v of ['Simplified Chinese', 'zh-Hans', 'zh-CN', '简体中文']) {
      expect(resolveLanguageCode(v)).toBe('zh-Hans');
    }
  });

  it('falls back generic Chinese to Simplified', () => {
    expect(resolveLanguageCode('Chinese')).toBe('zh-Hans');
    expect(resolveLanguageCode('中文')).toBe('zh-Hans');
    expect(resolveLanguageCode('zh')).toBe('zh-Hans');
  });
});

describe('getLanguage', () => {
  it('returns a registry entry with all required fields', () => {
    const entry = getLanguage('Spanish');
    expect(entry.code).toBe('es');
    expect(entry.promptName).toBe('Spanish');
    expect(typeof entry.scriptNote).toBe('string');
    expect(entry.dict).toBeTruthy();
  });

  it('attaches the script-note to Chinese languages and leaves others empty', () => {
    expect(getLanguage('zh-Hans').scriptNote).toMatch(/simplified/i);
    expect(getLanguage('zh-Hant').scriptNote).toMatch(/traditional/i);
    expect(getLanguage('English').scriptNote).toBe('');
    expect(getLanguage('Spanish').scriptNote).toBe('');
  });
});

describe('getUi', () => {
  it('returns the English dict by default', () => {
    expect(getUi(undefined)).toBe(en);
    expect(getUi('English')).toBe(en);
  });

  it('returns the matching dict for each language', () => {
    expect(getUi('Spanish').settings).toBe('Ajustes');
    expect(getUi('French').settings).toBe('Paramètres');
    expect(getUi('Japanese').settings).toBe('設定');
    expect(getUi('zh-Hans').settings).toBe('设置');
    expect(getUi('zh-Hant').settings).toBe('設置');
  });

  it('every dict shares the English key surface (no missing keys)', () => {
    const enKeys = Object.keys(en).sort();
    for (const lang of LANGUAGES) {
      const langKeys = Object.keys(lang.dict).sort();
      for (const k of enKeys) {
        expect(langKeys, `${lang.code} missing key ${k}`).toContain(k);
      }
    }
  });
});

describe('LANGUAGE_OPTIONS', () => {
  it('exposes one option per registry entry', () => {
    expect(LANGUAGE_OPTIONS).toHaveLength(LANGUAGES.length);
  });

  it('shows the native label when it differs from the English label', () => {
    const es = LANGUAGE_OPTIONS.find((o) => o.value === 'Spanish');
    expect(es.display).toBe('Spanish (Español)');
    const enOpt = LANGUAGE_OPTIONS.find((o) => o.value === 'English');
    expect(enOpt.display).toBe('English');
  });
});
