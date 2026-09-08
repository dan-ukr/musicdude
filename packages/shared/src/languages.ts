/**
 * Language facet vocabulary — ISO 639-1 codes covering the languages music is
 * actually sung in, worldwide. UI display names come from Intl.DisplayNames in
 * the viewer's own app language (no manual translation needed); 'unknown' stays
 * the honest bucket.
 */
export const MUSIC_LANGUAGES: readonly string[] = [
  // Europe
  'en', 'uk', 'ru', 'pl', 'de', 'fr', 'es', 'it', 'pt', 'be', 'cs', 'sk', 'hu',
  'ro', 'bg', 'hr', 'sr', 'bs', 'sl', 'mk', 'sq', 'el', 'tr', 'et', 'lv', 'lt',
  'fi', 'sv', 'no', 'da', 'is', 'nl', 'ca', 'gl', 'eu', 'ga', 'gd', 'cy', 'br',
  'mt', 'lb', 'fo', 'oc', 'co', 'rm', 'yi', 'la',
  // Caucasus & Central Asia
  'ka', 'hy', 'az', 'kk', 'ky', 'uz', 'tg', 'tk', 'mn',
  // Middle East & North Africa
  'ar', 'he', 'fa', 'ku', 'am', 'ti',
  // South Asia
  'hi', 'ur', 'bn', 'pa', 'ta', 'te', 'ml', 'kn', 'mr', 'gu', 'ne', 'si',
  // East & Southeast Asia
  'ja', 'ko', 'zh', 'th', 'vi', 'id', 'ms', 'tl', 'my', 'km', 'lo',
  // Sub-Saharan Africa
  'sw', 'ha', 'yo', 'ig', 'zu', 'xh', 'af', 'so', 'wo', 'ln', 'rw', 'mg', 'sn',
  // constructed / other
  'eo',
];

export const MUSIC_LANGUAGE_SET: ReadonlySet<string> = new Set(MUSIC_LANGUAGES);

/**
 * MusicBrainz/folksonomy tag -> language code. Human-curated tags, so mapping
 * them is reading, not guessing. Extend freely; anything unmapped stays unknown.
 */
export const LANGUAGE_TAG_MAP: Readonly<Record<string, string>> = {
  ukrainian: 'uk', russian: 'ru', polish: 'pl', german: 'de', french: 'fr',
  spanish: 'es', italian: 'it', portuguese: 'pt', belarusian: 'be', czech: 'cs',
  slovak: 'sk', hungarian: 'hu', romanian: 'ro', bulgarian: 'bg', croatian: 'hr',
  serbian: 'sr', bosnian: 'bs', slovenian: 'sl', macedonian: 'mk', albanian: 'sq',
  greek: 'el', turkish: 'tr', estonian: 'et', latvian: 'lv', lithuanian: 'lt',
  finnish: 'fi', swedish: 'sv', norwegian: 'no', danish: 'da', icelandic: 'is',
  dutch: 'nl', catalan: 'ca', galician: 'gl', basque: 'eu', irish: 'ga',
  welsh: 'cy', breton: 'br', maltese: 'mt', yiddish: 'yi', georgian: 'ka',
  armenian: 'hy', azerbaijani: 'az', kazakh: 'kk', kyrgyz: 'ky', uzbek: 'uz',
  tajik: 'tg', turkmen: 'tk', mongolian: 'mn', arabic: 'ar', hebrew: 'he',
  persian: 'fa', farsi: 'fa', kurdish: 'ku', amharic: 'am', hindi: 'hi',
  urdu: 'ur', bengali: 'bn', punjabi: 'pa', tamil: 'ta', telugu: 'te',
  malayalam: 'ml', kannada: 'kn', marathi: 'mr', gujarati: 'gu', nepali: 'ne',
  sinhala: 'si', japanese: 'ja', korean: 'ko', chinese: 'zh', mandarin: 'zh',
  cantonese: 'zh', thai: 'th', vietnamese: 'vi', indonesian: 'id', malay: 'ms',
  tagalog: 'tl', filipino: 'tl', burmese: 'my', khmer: 'km', lao: 'lo',
  swahili: 'sw', hausa: 'ha', yoruba: 'yo', igbo: 'ig', zulu: 'zu', xhosa: 'xh',
  afrikaans: 'af', somali: 'so', wolof: 'wo', lingala: 'ln', kinyarwanda: 'rw',
  malagasy: 'mg', shona: 'sn', esperanto: 'eo',
  'english-language': 'en',
  // Deliberately absent: 'latin'. As a tag it means Latin *music* (a genre in
  // GENRE_SET), not the Latin language, and mapping it labelled reggaeton
  // tracks as Latin-language.
};
