/**
 * Queue names. Song-of-day and care-now are separate pipelines by design:
 * different triggers, different failure costs, different metrics. Never merge them.
 */
export const QUEUES = {
  /** Full-library analysis after an import: resolve -> enrich -> facets -> embeddings -> portrait */
  SCAN: 'scan',
  /** MusicBrainz cultural graph lookup (rate-limited to 1 req/s, cached) */
  ENRICH_MUSICBRAINZ: 'enrich-musicbrainz',
  /** iTunes/Deezer preview lookup + ml-service /analyze */
  ENRICH_PREVIEW: 'enrich-preview',
  /** Rebuild the flat facet index rows for a user's tracks */
  BUILD_FACETS: 'build-facets',
  /** Aggregate portrait snapshot */
  PORTRAIT_REBUILD: 'portrait-rebuild',
  /** Channel A: batch daily card, fires at learned per-user hour, ships every day */
  DAILY_CARD: 'daily-card',
  /** Channel B: reactive mood-coherence evaluation; silence is a normal state */
  CARE_NOW: 'care-now',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
