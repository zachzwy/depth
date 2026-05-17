// Locale parity smoke test. Imports every translation module and asserts
// it has the same keys as the English base. Catches drift when someone
// adds a new UI string but forgets to translate it (which would manifest
// at runtime as a missing/undefined string in the panel).
//
// Also exercises every locale's module top level so coverage stops
// reporting them as ~10% covered for no real reason.

import { describe, it, expect } from 'vitest';
import { en } from '../../src/lib/i18n/en.js';
import { es } from '../../src/lib/i18n/es.js';
import { fr } from '../../src/lib/i18n/fr.js';
import { ja } from '../../src/lib/i18n/ja.js';
import { zhHans } from '../../src/lib/i18n/zh-Hans.js';
import { zhHant } from '../../src/lib/i18n/zh-Hant.js';
import { LANGUAGES, getUi, getLanguage, resolveLanguageCode } from '../../src/lib/i18n/index.js';

// Include en in the iteration so its function-typed values are invoked
// (otherwise they show as uncovered even though they're the source of
// truth the parity test compares against).
const LOCALES = { en, es, fr, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant };

describe('locale parity', () => {
  for (const [name, dict] of Object.entries(LOCALES)) {
    it(`${name} dict shape matches en`, () => {
      const enKeys = Object.keys(en).sort();
      const dictKeys = Object.keys(dict).sort();
      // Missing keys would render as undefined in the UI.
      const missing = enKeys.filter((k) => !(k in dict));
      const extra = dictKeys.filter((k) => !(k in en));
      expect(missing, `${name} missing keys`).toEqual([]);
      expect(extra, `${name} has unexpected keys`).toEqual([]);
      // Every value's type should match en — strings stay strings,
      // nested objects stay nested objects, functions stay functions.
      // Also invoke any function-typed values with placeholder args so
      // they actually execute (otherwise v8 reports them as uncovered).
      for (const k of enKeys) {
        expect(typeof dict[k], `${name}.${k} type`).toBe(typeof en[k]);
        if (typeof en[k] === 'function') {
          // Try both truthy and falsy `ready` since several locale
          // functions branch on it (e.g. levelAria). Other unused
          // positional args are ignored.
          const a = dict[k](1, 'name', true, 'extra1');
          const b = dict[k](2, 'other', false);
          expect(typeof a, `${name}.${k} call(ready=true) result`).toBe('string');
          expect(typeof b, `${name}.${k} call(ready=false) result`).toBe('string');
        }
      }
    });
  }
});

describe('i18n/index helpers across locales', () => {
  it('LANGUAGES contains all locales we ship', () => {
    const codes = LANGUAGES.map((l) => l.code).sort();
    expect(codes).toEqual(['en', 'es', 'fr', 'ja', 'zh-Hans', 'zh-Hant']);
  });

  it('getUi returns the right dict for each label', () => {
    expect(getUi('English')).toBe(en);
    expect(getUi('Spanish')).toBe(es);
    expect(getUi('French')).toBe(fr);
    expect(getUi('Japanese')).toBe(ja);
    expect(getUi('Simplified Chinese')).toBe(zhHans);
    expect(getUi('Traditional Chinese')).toBe(zhHant);
  });

  it('getUi falls back to English for unknown labels', () => {
    expect(getUi('Klingon')).toBe(en);
    expect(getUi(undefined)).toBe(en);
    expect(getUi('')).toBe(en);
  });

  it('getLanguage returns the full metadata block', () => {
    const lang = getLanguage('Japanese');
    expect(lang.code).toBe('ja');
    expect(lang.dict).toBe(ja);
    expect(lang.nativeLabel).toBe('日本語');
  });

  it('resolveLanguageCode maps human labels and codes to canonical codes', () => {
    expect(resolveLanguageCode('English')).toBe('en');
    expect(resolveLanguageCode('en')).toBe('en');
    expect(resolveLanguageCode('Spanish')).toBe('es');
    expect(resolveLanguageCode('zh-Hans')).toBe('zh-Hans');
    expect(resolveLanguageCode('Simplified Chinese')).toBe('zh-Hans');
    expect(resolveLanguageCode('something-unknown')).toBe('en');
  });
});
