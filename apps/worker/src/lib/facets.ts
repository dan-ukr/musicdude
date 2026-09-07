/**
 * Facet bucketing. Fixed thresholds for v1; every value falls back to the
 * honest 'unknown' — we never guess.
 */

export function eraBucket(year: number | null): string {
  if (!year || year < 1900) return 'unknown';
  if (year < 1970) return 'pre-1970';
  if (year < 1980) return '1970s';
  if (year < 1990) return '1980s';
  if (year < 2000) return '1990s';
  if (year < 2010) return '2000s';
  if (year < 2020) return '2010s';
  return '2020s';
}

export function tempoBucket(bpm: number | null): string {
  if (!bpm || bpm <= 40) return 'unknown';
  if (bpm < 95) return 'slow';
  if (bpm <= 125) return 'mid';
  return 'fast';
}

export function energyBucket(energy: number | null): string {
  if (energy === null || Number.isNaN(energy)) return 'unknown';
  if (energy < 0.4) return 'low';
  if (energy < 0.7) return 'mid';
  return 'high';
}

export function moodBucket(energy: number | null, valence: number | null): string {
  if (energy === null || valence === null) return 'unknown';
  if (energy >= 0.6 && valence >= 0.6) return 'euphoric';
  if (energy >= 0.6 && valence < 0.4) return 'dark';
  if (energy >= 0.6) return 'energetic';
  if (energy < 0.4 && valence < 0.4) return 'melancholic';
  if (energy < 0.4 && valence >= 0.6) return 'warm';
  return 'calm';
}

/** Deezer rank runs roughly 0..1,000,000 (higher = more popular). */
export function rarityBucket(deezerRank: number | null): string {
  if (deezerRank === null) return 'unknown';
  if (deezerRank > 700_000) return 'mainstream';
  if (deezerRank > 400_000) return 'known';
  if (deezerRank > 100_000) return 'niche';
  return 'rare';
}

const REGION_BY_COUNTRY: Record<string, string> = {
  // eastern europe
  UA: 'eastern-europe', BY: 'eastern-europe', PL: 'eastern-europe', CZ: 'eastern-europe',
  SK: 'eastern-europe', HU: 'eastern-europe', RO: 'eastern-europe', BG: 'eastern-europe',
  HR: 'eastern-europe', RS: 'eastern-europe', SI: 'eastern-europe', BA: 'eastern-europe',
  MK: 'eastern-europe', AL: 'eastern-europe', EE: 'eastern-europe', LV: 'eastern-europe',
  LT: 'eastern-europe', MD: 'eastern-europe', RU: 'eastern-europe', GE: 'eastern-europe',
  // western europe
  GB: 'western-europe', FR: 'western-europe', DE: 'western-europe', IT: 'western-europe',
  ES: 'western-europe', PT: 'western-europe', NL: 'western-europe', BE: 'western-europe',
  SE: 'western-europe', NO: 'western-europe', DK: 'western-europe', FI: 'western-europe',
  IE: 'western-europe', AT: 'western-europe', CH: 'western-europe', GR: 'western-europe',
  IS: 'western-europe', LU: 'western-europe', MT: 'western-europe', CY: 'western-europe',
  // north america
  US: 'north-america', CA: 'north-america',
  // latin america
  MX: 'latin-america', BR: 'latin-america', AR: 'latin-america', CL: 'latin-america',
  CO: 'latin-america', PE: 'latin-america', UY: 'latin-america', VE: 'latin-america',
  EC: 'latin-america', BO: 'latin-america', PY: 'latin-america', CU: 'latin-america',
  DO: 'latin-america', PR: 'latin-america', JM: 'latin-america',
  // africa
  NG: 'africa', ZA: 'africa', GH: 'africa', KE: 'africa', EG: 'africa', MA: 'africa',
  SN: 'africa', ML: 'africa', CD: 'africa', TZ: 'africa', ET: 'africa', DZ: 'africa',
  // middle east
  TR: 'middle-east', IL: 'middle-east', SA: 'middle-east', AE: 'middle-east',
  IR: 'middle-east', IQ: 'middle-east', LB: 'middle-east', JO: 'middle-east', SY: 'middle-east',
  // asia
  JP: 'asia', KR: 'asia', CN: 'asia', IN: 'asia', TH: 'asia', VN: 'asia', PH: 'asia',
  ID: 'asia', MY: 'asia', TW: 'asia', HK: 'asia', SG: 'asia', PK: 'asia', BD: 'asia',
  // oceania
  AU: 'oceania', NZ: 'oceania',
};

export function regionFromCountry(country: string | null): string {
  if (!country) return 'unknown';
  return REGION_BY_COUNTRY[country.toUpperCase()] ?? 'unknown';
}
