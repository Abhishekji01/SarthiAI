import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storage } from '../lib/platform';
import { en, type MessageKey } from './en';
import { hi } from './hi';

/**
 * Interface languages. To add one (e.g. Tamil): create ta.ts like hi.ts and add
 * it here; untranslated keys fall back to English.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', messages: en as Partial<Record<MessageKey, string>> },
  { code: 'hi', label: 'हिन्दी (Hindi)', messages: hi },
] as const;
export type LangCode = (typeof LANGUAGES)[number]['code'];
const KEY = 'sarthi.lang';

export function translate(lang: LangCode, key: MessageKey, vars?: Record<string, string | number>) {
  const msgs = LANGUAGES.find((l) => l.code === lang)?.messages ?? en;
  let s = msgs[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

const isLang = (v: string | null): v is LangCode => LANGUAGES.some((l) => l.code === v);
/** First visit: follow the device language if we support it. */
const initial = (): LangCode => {
  try { const v = localStorage.getItem(KEY); if (isLang(v)) return v; } catch { /* ignore */ }
  return typeof navigator !== 'undefined' && /^hi\b/i.test(navigator.language) ? 'hi' : 'en';
};

interface I18n { lang: LangCode; setLang: (l: LangCode) => void; t: (key: MessageKey, vars?: Record<string, string | number>) => string }
/** For code outside components (e.g. shared error cards): the language currently shown. */
let active: LangCode = 'en';
export const currentLang = () => active;

const Ctx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k, v) => translate('en', k, v) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(initial);
  // The Android app keeps the choice in native storage too.
  useEffect(() => { storage.get(KEY).then((v) => { if (isLang(v) && v !== lang) setLangState(v); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  active = lang;
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: LangCode) => { setLangState(l); storage.set(KEY, l).catch(() => {}); }, []);
  const value = useMemo<I18n>(() => ({ lang, setLang, t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
