import fr from './locales/fr.json';
import it from './locales/it.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import uk from './locales/uk.json';
import pl from './locales/pl.json';
import be from './locales/be.json';
import de from './locales/de.json';
import hr from './locales/hr.json';
import tr from './locales/tr.json';

export type AppLanguage = 'en' | 'fr' | 'it' | 'es' | 'pt' | 'uk' | 'pl' | 'be' | 'de' | 'hr' | 'tr';

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
  es: 'Español',
  pt: 'Português',
  uk: 'Українська',
  pl: 'Polski',
  be: 'Беларуская',
  de: 'Deutsch',
  hr: 'Hrvatski',
  tr: 'Türkçe',
};

const dictionaries: Record<Exclude<AppLanguage, 'en'>, Record<string, string>> = {
  fr, it, es, pt, uk, pl, be, de, hr, tr,
};

/** Phrase-keyed: the English phrase is the key; missing entries fall back to English. */
export function translate(lang: AppLanguage, phrase: string): string {
  if (lang === 'en') return phrase;
  return (dictionaries[lang] as Record<string, string>)[phrase] ?? phrase;
}
