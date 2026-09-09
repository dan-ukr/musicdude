/**
 * Facet slug -> English phrase key (translated via t()).
 * Facet-scoped: 'mid' labels differently for tempo vs energy.
 */

type FacetKind = 'mood' | 'era' | 'region' | 'tempo' | 'energy' | 'rarity' | 'language' | 'genre';

const MOOD: Record<string, string> = {
  energetic: 'Energetic',
  calm: 'Calm',
  melancholic: 'Melancholic',
  euphoric: 'Euphoric',
  dark: 'Dark',
  warm: 'Warm',
};

const ERA: Record<string, string> = {
  'pre-1970': 'Before 1970',
  '1970s': '1970s',
  '1980s': '1980s',
  '1990s': '1990s',
  '2000s': '2000s',
  '2010s': '2010s',
  '2020s': '2020s',
};

const REGION: Record<string, string> = {
  'western-europe': 'Western Europe',
  'eastern-europe': 'Eastern Europe',
  'north-america': 'North America',
  'latin-america': 'Latin America',
  africa: 'Africa',
  'middle-east': 'Middle East',
  asia: 'Asia',
  oceania: 'Oceania',
};

const TEMPO: Record<string, string> = {
  slow: 'Slow',
  mid: 'Mid-tempo',
  fast: 'Fast',
};

const ENERGY: Record<string, string> = {
  low: 'Low energy',
  mid: 'Mid energy',
  high: 'High energy',
};

const RARITY: Record<string, string> = {
  mainstream: 'Mainstream',
  known: 'Known',
  niche: 'Niche',
  rare: 'Rare',
};

const BY_KIND: Partial<Record<FacetKind, Record<string, string>>> = {
  mood: MOOD,
  era: ERA,
  region: REGION,
  tempo: TEMPO,
  energy: ENERGY,
  rarity: RARITY,
};

/**
 * Localized name of a language (ISO 639-1) in the viewer's UI language,
 * via the built-in Intl database — «українська», «польська», «Deutsch», … —
 * no manual translation table to maintain. Falls back to the uppercased code.
 */
function languageName(code: string, uiLang: string): string {
  // Not a language code: a recording with no words, which is its own answer.
  if (code === 'instrumental') return 'Instrumental';
  try {
    const name = new Intl.DisplayNames([uiLang], { type: 'language' }).of(code);
    if (name && name !== code) return name;
  } catch {
    /* Intl.DisplayNames unavailable on this engine */
  }
  return code.toUpperCase();
}

/**
 * Display label for a facet value; pass the result through t().
 * - language: already localized via Intl (t() passes it through untouched)
 * - genre: canonical MusicBrainz name, displayed as-is by industry convention
 */
export function facetValueLabel(kind: FacetKind, value: string, uiLang = 'en'): string {
  if (value === 'unknown') return 'Unknown';
  if (kind === 'language') return languageName(value, uiLang);
  if (kind === 'genre') return value;
  return BY_KIND[kind]?.[value] ?? value;
}
