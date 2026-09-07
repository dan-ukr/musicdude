import type { Job } from 'bullmq';
import { db } from '../db';
import { regionFromCountry } from '../lib/facets';
import { rebuildPortrait } from '../lib/portrait';

const MB_BASE = process.env.MUSICBRAINZ_BASE_URL ?? 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'MusicDude/0.1.0 (contact@musicdude.app)';
const MIN_SCORE = 85;

type MbArtist = {
  id: string;
  name: string;
  score: number;
  country?: string;
  'life-span'?: { begin?: string };
  tags?: { name: string; count: number }[];
};

/**
 * Artist-level cultural enrichment. The queue's limiter enforces 1 req/1.1s
 * (musicbrainz.org allows ~1 req/s per app). Already-enriched artists skip the API.
 */
export async function processEnrichMusicbrainz(job: Job): Promise<void> {
  const { artistName, userId } = job.data as { artistName: string; userId: string };

  const existing = await db.query<{ country: string | null }>(
    `SELECT country FROM music.artists WHERE lower(name) = lower($1) AND country IS NOT NULL LIMIT 1`,
    [artistName],
  );

  let country: string | null = existing.rows[0]?.country ?? null;

  if (!country) {
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
    const beginYear = hit['life-span']?.begin ? Number(hit['life-span'].begin.slice(0, 4)) || null : null;
    const tags = (hit.tags ?? []).slice(0, 10).map((t) => t.name);

    await db.query(
      `INSERT INTO music.artists (name, mbid, country, begin_year, tags)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (mbid) DO UPDATE SET country = EXCLUDED.country,
         begin_year = EXCLUDED.begin_year, tags = EXCLUDED.tags`,
      [hit.name, hit.id, country, beginYear, JSON.stringify(tags)],
    );
  }

  const region = regionFromCountry(country);
  if (region !== 'unknown') {
    await db.query(
      `UPDATE music.track_facets tf SET region = $1, updated_at = now()
       FROM music.tracks t
       WHERE t.id = tf.track_id AND lower(t.artist_name) = lower($2)`,
      [region, artistName],
    );
    await rebuildPortrait(userId);
  }
}
