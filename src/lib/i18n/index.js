import { en } from './en.js';
import { es } from './es.js';
import { fr } from './fr.js';
import { ja } from './ja.js';
import { zhHans } from './zh-Hans.js';
import { zhHant } from './zh-Hant.js';

export const LANGUAGES = [
  {
    code: 'en',
    label: 'English',
    nativeLabel: 'English',
    promptName: 'English',
    scriptNote: '',
    dict: en,
  },
  {
    code: 'es',
    label: 'Spanish',
    nativeLabel: 'Español',
    promptName: 'Spanish',
    scriptNote: '',
    dict: es,
  },
  {
    code: 'fr',
    label: 'French',
    nativeLabel: 'Français',
    promptName: 'French',
    scriptNote: '',
    dict: fr,
  },
  {
    code: 'ja',
    label: 'Japanese',
    nativeLabel: '日本語',
    promptName: 'Japanese',
    scriptNote: '',
    dict: ja,
  },
  {
    code: 'zh-Hans',
    label: 'Simplified Chinese',
    nativeLabel: '简体中文',
    promptName: 'Simplified Chinese (zh-Hans)',
    scriptNote:
      ' Use simplified Chinese characters only — never traditional (繁體). Prefer Mainland punctuation and conventions.',
    dict: zhHans,
  },
  {
    code: 'zh-Hant',
    label: 'Traditional Chinese',
    nativeLabel: '繁體中文',
    promptName: 'Traditional Chinese (zh-Hant)',
    scriptNote:
      ' Use traditional Chinese characters only — never simplified (简体). Prefer Taiwan punctuation and conventions.',
    dict: zhHant,
  },
];

const DEFAULT = LANGUAGES[0];

export function resolveLanguageCode(language) {
  const lower = (language ?? '').toLowerCase().trim();
  if (!lower) return DEFAULT.code;

  // Traditional Chinese tests must precede generic Chinese.
  if (
    lower.startsWith('zh-hant') ||
    lower === 'zh-tw' ||
    lower === 'zh-hk' ||
    lower === 'zh-mo' ||
    lower.includes('traditional chinese') ||
    lower.includes('traditional-chinese') ||
    lower.includes('繁體') ||
    lower.includes('繁体')
  ) {
    return 'zh-Hant';
  }

  if (
    lower.startsWith('zh-hans') ||
    lower === 'zh-cn' ||
    lower === 'zh-sg' ||
    lower.includes('simplified chinese') ||
    lower.includes('简体') ||
    lower.includes('汉语')
  ) {
    return 'zh-Hans';
  }

  // Generic Chinese defaults to Simplified.
  if (lower.includes('chinese') || lower.includes('中文') || lower.startsWith('zh')) {
    return 'zh-Hans';
  }

  if (
    lower.startsWith('es') ||
    lower.includes('spanish') ||
    lower.includes('español') ||
    lower.includes('espanol')
  ) {
    return 'es';
  }

  if (
    lower.startsWith('fr') ||
    lower.includes('french') ||
    lower.includes('français') ||
    lower.includes('francais')
  ) {
    return 'fr';
  }

  if (lower.startsWith('ja') || lower.includes('japanese') || lower.includes('日本')) {
    return 'ja';
  }

  return DEFAULT.code;
}

export function getLanguage(language) {
  const code = resolveLanguageCode(language);
  return LANGUAGES.find((l) => l.code === code) ?? DEFAULT;
}

export function getUi(language) {
  return getLanguage(language).dict;
}

export const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  value: l.label,
  display: l.label === l.nativeLabel ? l.label : `${l.label} (${l.nativeLabel})`,
}));
