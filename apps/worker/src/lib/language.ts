/**
 * Language detection for track titles — evidence only, never a guess.
 *
 * Tier 1 (here, free, instant): the writing system and its distinctive letters.
 *   Hangul is Korean; ў is Belarusian; ł is Polish. No network, no ambiguity.
 * Tier 2: scripts shared by several languages (bare Cyrillic, Han, Devanagari,
 *   Arabic) are reported as `ambiguous` and resolved by the artist's country.
 * Anything else stays unknown — an honest gap keeps every other facet trustworthy.
 */

import { COUNTRY_MAIN_LANGUAGE } from '@musicdude/shared';

export type Detection =
  | { code: string }
  | { ambiguous: AmbiguousScript }
  | null;

export type AmbiguousScript = 'cyrillic' | 'han' | 'devanagari' | 'arabic' | 'nordic';

/** Script ranges that map to exactly one language. */
const UNIQUE_SCRIPTS: [RegExp, string][] = [
  [/[가-힯ᄀ-ᇿ]/, 'ko'], // Hangul
  [/[぀-ゟ゠-ヿ]/, 'ja'], // Hiragana / Katakana
  [/[Ͱ-Ͽἀ-῿]/, 'el'], // Greek
  [/[֐-׿]/, 'he'],
  [/[Ⴀ-ჿᲐ-Ჿ]/, 'ka'], // Georgian
  [/[԰-֏]/, 'hy'], // Armenian
  [/[฀-๿]/, 'th'],
  [/[຀-໿]/, 'lo'],
  [/[ក-៿]/, 'km'],
  [/[က-႟]/, 'my'],
  [/[ሀ-፿]/, 'am'], // Ethiopic
  [/[஀-௿]/, 'ta'],
  [/[ఀ-౿]/, 'te'],
  [/[ಀ-೿]/, 'kn'],
  [/[ഀ-ൿ]/, 'ml'],
  [/[ঀ-৿]/, 'bn'],
  [/[਀-੿]/, 'pa'], // Gurmukhi
  [/[઀-૿]/, 'gu'],
  [/[඀-෿]/, 'si'],
];

/** Letters unique to one language within a shared script. */
const UNIQUE_LETTERS: [RegExp, string][] = [
  // Cyrillic
  [/[ўЎ]/, 'be'],
  [/[їЇєЄґҐ]/, 'uk'],
  [/[ыЫэЭъЪ]/, 'ru'],
  // Latin
  [/[łŁżŻźŹśŚćĆńŃ]/, 'pl'],
  [/[ğĞşŞıİ]/, 'tr'],
  [/[ñÑ]/, 'es'],
  [/[ãÃõÕ]/, 'pt'],
  [/[őŐűŰ]/, 'hu'],
  [/[řŘěĚůŮ]/, 'cs'],
  [/[șȘțȚăĂ]/, 'ro'],
  [/[ðÐþÞ]/, 'is'],
  [/[ūŪėĖįĮųŲ]/, 'lt'],
  [/[ġĠħĦ]/, 'mt'],
  [/[ơƠưƯđĐạẠệỆếẾồỒ]/, 'vi'],
  [/ß/, 'de'],
  // Arabic script
  [/[پچژگ]/, 'fa'],
  [/[ٹڈڑںھ]/, 'ur'],
];

const SHARED_SCRIPTS: [RegExp, AmbiguousScript][] = [
  [/[Ѐ-ӿ]/, 'cyrillic'],
  [/[一-鿿]/, 'han'], // zh unless kana was already matched above
  [/[ऀ-ॿ]/, 'devanagari'],
  [/[؀-ۿ]/, 'arabic'],
  [/[øØæÆ]/, 'nordic'], // da / no
];

export function detectFromTitle(title: string): Detection {
  if (!title) return null;
  for (const [re, code] of UNIQUE_SCRIPTS) if (re.test(title)) return { code };
  for (const [re, code] of UNIQUE_LETTERS) if (re.test(title)) return { code };
  for (const [re, script] of SHARED_SCRIPTS) if (re.test(title)) return { ambiguous: script };
  return null;
}

/** Which language a shared script means, given where the artist is from. */
const BY_SCRIPT_AND_COUNTRY: Record<AmbiguousScript, Record<string, string>> = {
  cyrillic: { UA: 'uk', BY: 'be', RU: 'ru', BG: 'bg', RS: 'sr', MK: 'mk', ME: 'sr', KZ: 'kk', KG: 'ky', MN: 'mn', TJ: 'tg' },
  han: { CN: 'zh', TW: 'zh', HK: 'zh', SG: 'zh', JP: 'ja' },
  devanagari: { IN: 'hi', NP: 'ne' },
  arabic: { IR: 'fa', AF: 'fa', PK: 'ur', SA: 'ar', EG: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', LB: 'ar', IQ: 'ar', JO: 'ar', SY: 'ar', AE: 'ar', KW: 'ar', LY: 'ar', SD: 'ar', YE: 'ar' },
  nordic: { NO: 'no', DK: 'da', FO: 'fo' },
};

/**
 * Final language for a track. `artistLanguages` is the artist's own working
 * language(s) from Wikidata — used only when there is exactly one, so a
 * multilingual artist never gets a coin flip.
 */
export function resolveLanguage(
  title: string,
  countryCode: string | null,
  artistLanguages: string[] = [],
  allowCountryFallback = false,
): string | null {
  const detection = detectFromTitle(title);

  if (detection && 'code' in detection) return detection.code;

  if (detection && 'ambiguous' in detection) {
    const byCountry = countryCode
      ? BY_SCRIPT_AND_COUNTRY[detection.ambiguous][countryCode.toUpperCase()]
      : undefined;
    if (byCountry) return byCountry;
    // A shared script with no country signal: report nothing rather than guess.
    return null;
  }

  // Latin script with no distinctive letters (an English title looks identical
  // to a Spanish one). Only a single unambiguous artist language counts here.
  if (artistLanguages.length === 1) return artistLanguages[0];

  // Everything else exhausted: the main language of the artist's country. This
  // runs last on purpose — ahead of the lyrics it would call ABBA Swedish.
  if (allowCountryFallback && countryCode) {
    return COUNTRY_MAIN_LANGUAGE[countryCode.toUpperCase()] ?? null;
  }
  return null;
}
