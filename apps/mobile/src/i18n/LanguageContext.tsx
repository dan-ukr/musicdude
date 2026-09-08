import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { storage } from '../utils/storage';
import { type AppLanguage, translate } from './index';
import { setGlobalT } from './globalTranslate';

const STORAGE_KEY = 'app_language';

type LanguageContextValue = {
  lang: AppLanguage;
  t: (phrase: string) => string;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  /** true until the stored language has been loaded (welcome uses it to auto-open the picker) */
  ready: boolean;
  hasStoredChoice: boolean;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  t: (s) => s,
  setLanguage: async () => {},
  ready: false,
  hasStoredChoice: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<AppLanguage>('en');
  const [ready, setReady] = useState(false);
  const [hasStoredChoice, setHasStoredChoice] = useState(false);

  useEffect(() => {
    storage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        setLang(stored as AppLanguage);
        setHasStoredChoice(true);
      }
      setReady(true);
    });
  }, []);

  const setLanguage = useCallback(async (next: AppLanguage) => {
    setLang(next);
    setHasStoredChoice(true);
    await storage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback((phrase: string) => translate(lang, phrase), [lang]);

  useEffect(() => {
    setGlobalT(t);
  }, [t]);

  return (
    <LanguageContext.Provider value={{ lang, t, setLanguage, ready, hasStoredChoice }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

/** Shorthand: just the t() function. */
export function useT() {
  return useContext(LanguageContext).t;
}

/**
 * Translates a template and substitutes {named} values — used for sentences
 * built by the server (card reasons, event match lines), which must read
 * naturally in every language rather than being assembled from English parts.
 */
export function useTemplate() {
  const t = useT();
  return (template: string, params: Record<string, string> = {}) =>
    Object.entries(params).reduce(
      (text, [key, value]) => text.replace(`{${key}}`, value),
      t(template),
    );
}
