import type { Job } from 'bullmq';
import { GENRE_SET, LANGUAGE_TAG_MAP } from '@musicdude/shared';
import { db } from '../db';
import { regionFromCountry } from '../lib/facets';
import { rebuildPortrait } from '../lib/portrait';

const MB_BASE = process.env.MUSICBRAINZ_BASE_URL ?? 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'MusicDude/0.1.0 (contact@musicdude.app)';
const MIN_SCORE = 85;
const MAX_GENRES = 5;

type MbTag = { name: string; count: number };
type MbArtist = {
  id: string;
  name: string;
  score: number;
  country?: string;
  'life-span'?: { begin?: string };
  tags?: MbTag[];
};

/** Tags are human-curated: mapping them is reading, not guessing. */
function deriveFromTags(tags: MbTag[]): { genres: string[]; language: string | null } {
  const sorted = [...tags].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const genres: string[] = [];
  let language: string | null = null;
  for (const tag of sorted) {
    const name = tag.name.toLowerCase().trim();
    if (genres.length < MAX_GENRES && GENRE_SET.has(name)) genres.push(name);
    if (!language && LANGUAGE_TAG_MAP[name]) language = LANGUAGE_TAG_MAP[name];
  }
  return { genres, language };
}

/**
 * Artist-level cultural enrichment: country -> region, tags -> genres + language.
 * The queue's limiter enforces 1 req/1.1s (musicbrainz.org allows ~1 req/s per app).
 * Already-enriched artists skip the API and reuse stored data.
 */
export async function processEnrichMusicbrainz(job: Job): Promise<void> {
  const { artistName, userId } = job.data as { artistName: string; userId: string };

  const existing = await db.query<{ country: string | null; tags: MbTag[] | string[] }>(
    `SELECT country, tags FROM music.artists WHERE lower(name) = lower($1) LIMIT 1`,
    [artistName],
  );

  let country: string | null = existing.rows[0]?.country ?? null;
  let tags: MbTag[] = normalizeStoredTags(existing.rows[0]?.tags);

  if (existing.rows.length === 0) {
    const url = `${MB_BASE}/artist/?query=artist:${encodeURIComponent(`"${artistName}"`)}&fmt=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      if (res.status === 503) throw new Error('musicbrainz rate limited'); // retried by BullMQ
      return;
    }
    const data = (await res.json()) as { artists?: MbArtist[] };
    const hit = data.artists?.[0];
    if (!hit || hit.score < MIN_SCORE) return; // honest unknown: never guess

    country = hit.country ?? null;
    tags = hit.tags ?? [];
    const beginYear = hit['life-span']?.begin ? Number(hit['life-span'].begin.slice(0, 4)) || null : null;

    await db.query(
      `INSERT INTO music.artists (name, mbid, country, begin_year, tags)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (mbid) DO UPDATE SET country = EXCLUDED.country,
         begin_year = EXCLUDED.begin_year, tags = EXCLUDED.tags`,
      [hit.name, hit.id, country, beginYear, JSON.stringify(tags)],
    );
  }

  const region = regionFromCountry(country);
  const { genres, language } = deriveFromTags(tags);

  if (region === 'unknown' && genres.length === 0 && !language) return;

  await db.query(
    `UPDATE music.track_facets tf SET
       region = CASE WHEN $1 <> 'unknown' THEN $1 ELSE tf.region END,
       language = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE tf.language END,
       genres = CASE WHEN cardinality($3::text[]) > 0 THEN $3::text[] ELSE tf.genres END,
       updated_at = now()
     FROM music.tracks t
     WHERE t.id = tf.track_id AND lower(t.artist_name) = lower($4)`,
    [region, language, genres, artistName],
  );
  await rebuildPortrait(userId);
}

function normalizeStoredTags(raw: unknown): MbTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) =>
      typeof t === 'string'
        ? { name: t, count: 1 }
        : (t as MbTag)?.name
          ? { name: (t as MbTag).name, count: (t as MbTag).count ?? 1 }
          : null,
    )
    .filter((t): t is MbTag => t !== null);
}
