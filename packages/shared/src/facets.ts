/**
 * The facet index — the flat, queryable second read of the taste data.
 * Every facet has an honest `unknown` bucket. We never guess.
 */

export const FACET_UNKNOWN = 'unknown' as const;

export const MOODS = [
  'energetic',
  'calm',
  'melancholic',
  'euphoric',
  'dark',
  'warm',
  FACET_UNKNOWN,
] as const;
export type Mood = (typeof MOODS)[number];

export const ERAS = [
  'pre-1970',
  '1970s',
  '1980s',
  '1990s',
  '2000s',
  '2010s',
  '2020s',
  FACET_UNKNOWN,
] as const;
export type Era = (typeof ERAS)[number];

/** Coarse cultural regions derived from MusicBrainz artist country. */
export const REGIONS = [
  'western-europe',
  'eastern-europe',
  'north-america',
  'latin-america',
  'africa',
  'middle-east',
  'asia',
  'oceania',
  FACET_UNKNOWN,
] as const;
export type Region = (typeof REGIONS)[number];

export const TEMPO_BUCKETS = ['slow', 'mid', 'fast', FACET_UNKNOWN] as const;
export type TempoBucket = (typeof TEMPO_BUCKETS)[number];

export const ENERGY_BUCKETS = ['low', 'mid', 'high', FACET_UNKNOWN] as const;
export type EnergyBucket = (typeof ENERGY_BUCKETS)[number];

export const RARITY_BUCKETS = ['mainstream', 'known', 'niche', 'rare', FACET_UNKNOWN] as const;
export type RarityBucket = (typeof RARITY_BUCKETS)[number];

/** ISO 639-1 code or `unknown`. Derived from artist country + release language + tags. */
export type TrackLanguage = string;

export type TrackFacets = {
  trackId: string;
  language: TrackLanguage;
  mood: Mood;
  era: Era;
  region: Region;
  tempo: TempoBucket;
  energy: EnergyBucket;
  rarity: RarityBucket;
  /** Canonical MusicBrainz genres (see genres.ts); multi-valued, [] = unknown. */
  genres: string[];
};

export type FacetQuery = Partial<Omit<TrackFacets, 'trackId' | 'genres'>> & { genre?: string };
