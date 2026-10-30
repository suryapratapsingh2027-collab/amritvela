import { M, type MessageKey } from './messages';

export type Lang = 'en' | 'hi' | 'hing' | 'pa' | 'mr';
export const LANGS: Lang[] = ['en', 'hi', 'hing', 'pa', 'mr'];
/** Language used before a customer has picked one (matches how the bot always spoke before). */
export const DEFAULT_LANG: Lang = 'hing';

/** Titles shown in the language picker. Each is written in its own language, so people can find theirs. */
export const LANG_TITLES: Record<Lang, string> = { en: 'English', hi: 'हिन्दी (Hindi)', hing: 'Hinglish', pa: 'ਪੰਜਾਬੀ (Punjabi)', mr: 'मराठी (Marathi)' };
export const LANG_NAMES_FOR_AI: Record<Lang, string> = {
  en: 'English', hi: 'Hindi (Devanagari script)', hing: 'Hinglish (Hindi written in the Roman/English alphabet)',
  pa: 'Punjabi (Gurmukhi script)', mr: 'Marathi (Devanagari script)',
};

export function isLang(v: unknown): v is Lang { return typeof v === 'string' && (LANGS as string[]).includes(v); }
export function normalizeLang(v: unknown): Lang | null { return isLang(v) ? v : null; }

/** Looks up a message in the customer's language and fills {placeholders}. Missing language falls back to Hinglish. */
export function t(lang: Lang | null | undefined, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const entry = M[key];
  const template = entry[lang ?? DEFAULT_LANG] ?? entry[DEFAULT_LANG];
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] !== undefined ? String(vars[name]) : `{${name}}`));
}

export type { MessageKey };
