import { RateLimitError, type Job, type Worker } from 'bullmq';
import { GENRE_SET, LANGUAGE_TAG_MAP } from '@musicdude/shared';
import { db } from '../db';
import { refreshItemEmbedding } from '../lib/embedding';
import { regionFromCountry } from '../lib/facets';
import { resolveLanguage } from '../lib/language';
import { rebuildPortrait } from '../lib/portrait';
import { lookupArtist } from '../lib/wikidata';

const MB_BASE = process.env.MUSICBRAINZ_BASE_URL ?? 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'MusicDude/0.1.0 (contact@musicdude.app)';
const MIN_SCORE = 85;
const MAX_GENRES = 5;
const DEFAULT_RETRY_AFTER_MS = 5_000;

type MbTag = { name: string; count: number };
type MbArea = { 'iso-3166-1-codes'?: string[] };
type MbArtist = {
  id: string;
  name: string;
  score: number;
  country?: string;
  area?: MbArea;
  'begin-area'?: MbArea;
  'life-span'?: { begin?: string };
  tags?: MbTag[];
};

type ArtistFacts = {
  name: string;
  mbid: string | null;
  country: string | null;
  beginYear: number | null;
  tags: MbTag[];
  genres: string[];
  tagLanguage: string | null;
  wikidataQid: string | null;
  languages: string[];
};

/**
 * Batched artist enrichment. One MusicBrainz request covers a whole chunk of
 * artists (its Lucene query accepts OR-joined names), which is what keeps us
 * under the ~1 req/s limit — per-artist requests spent the entire budget on a
 * single import and still drew 503s.
 *
 * Order of evidence: MusicBrainz country, then its area/begin-area, then
 * Wikidata. Language comes from the track's own writing system first, then the
 * artist's country to disambiguate shared scripts, then the artist's single
 * documented language. Never a guess — unresolved stays 'unknown'.
 */
export async function processEnrichMusicbrainz(job: Job, worker: Worker): Promise<void> {
  const { artistNames, userId } = job.data as { artistNames: string[]; userId: string };
  if (!artistNames?.length) return;

  const pending = await filterUnenriched(artistNames);
  const facts: ArtistFacts[] = [];

  if (pending.length > 0) {
    const found = await searchArtists(pending, worker);
    const foundNames = new Set(found.map((f) => f.name.toLowerCase()));
    facts.push(...found);

    // Artists MusicBrainz does not know (or scored too low) get one Wikidata try.
    for (const name of pending.filter((n) => !foundNames.has(n.toLowerCase()))) {
      try {
        const wd = await lookupArtist(name);
        if (wd) {
          // Wikidata genre labels are stored as tags so the same canonical
          // filter applies to them as to MusicBrainz tags.
          const tags = wd.genreLabels.map((label) => ({ name: label.toLowerCase(), count: 1 }));
          facts.push({
            name,
            mbid: null,
            country: wd.countryCode,
            beginYear: null,
            tags,
            genres: deriveFromTags(tags).genres,
            tagLanguage: null,
            wikidataQid: wd.qid,
            languages: wd.languages,
          });
        }
      } catch (err) {
        console.error(`[enrich] wikidata ${name}: ${(err as Error).message}`);
      }
    }

    // Wikidata also fills gaps MusicBrainz left: no country, or no usable tags.
    for (const fact of facts) {
      if (fact.wikidataQid) continue;
      if (fact.country && fact.genres.length > 0) continue;
      try {
        const wd = await lookupArtist(fact.name);
        if (!wd) continue;
        fact.wikidataQid = wd.qid;
        fact.country = fact.country ?? wd.countryCode;
        fact.languages = wd.languages;
        if (fact.genres.length === 0 && wd.genreLabels.length > 0) {
          fact.tags = wd.genreLabels.map((label) => ({ name: label.toLowerCase(), count: 1 }));
          fact.genres = deriveFromTags(fact.tags).genres;
        }
      } catch {
        /* leave unknown */
      }
    }

    for (const fact of facts) await storeArtist(fact);
  }

  // Apply to facets for every requested artist, including ones enriched earlier.
  const stored = await loadStoredArtists(artistNames);
  let touched = 0;
  for (const artist of stored) touched += await applyToTracks(artist);
  if (touched > 0) await rebuildPortrait(userId);
}

async function filterUnenriched(names: string[]): Promise<string[]> {
  const res = await db.query<{ name: string }>(
    `SELECT lower(name) AS name FROM music.artists
     WHERE lower(name) = ANY($1::text[]) AND enriched_at IS NOT NULL`,
    [names.map((n) => n.toLowerCase())],
  );
  const done = new Set(res.rows.map((r) => r.name));
  return names.filter((n) => !done.has(n.toLowerCase()));
}

/** One request for the whole chunk; 503 pauses the worker for Retry-After. */
async function searchArtists(names: string[], worker: Worker): Promise<ArtistFacts[]> {
  const query = names.map((n) => `artist:"${n.replace(/["\\]/g, ' ')}"`).join(' OR ');
  const url = `${MB_BASE}/artist/?query=${encodeURIComponent(query)}&fmt=json&limit=${Math.min(names.length * 3, 100)}`;

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 503 || res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_RETRY_AFTER_MS;
    // Pause the whole queue, not just this job: the limit is per client, so
    // letting other jobs through would keep it saturated.
    await worker.rateLimit(waitMs);
    throw new RateLimitError();
  }
  if (!res.ok) {
    console.error(`[enrich] musicbrainz HTTP ${res.status}`);
    return [];
  }

  const data = (await res.json()) as { artists?: MbArtist[] };
  const wanted = new Map(names.map((n) => [n.toLowerCase(), n]));
  const best = new Map<string, ArtistFacts>();

  for (const hit of data.artists ?? []) {
    if (hit.score < MIN_SCORE) continue;
    const key = hit.name.toLowerCase();
    const requested = wanted.get(key);
    if (!requested || best.has(key)) continue; // results are score-ordered

    const { genres, tagLanguage } = deriveFromTags(hit.tags ?? []);
    best.set(key, {
      name: requested,
      mbid: hit.id,
      country:
        hit.country ??
        hit.area?.['iso-3166-1-codes']?.[0] ??
        hit['begin-area']?.['iso-3166-1-codes']?.[0] ??
        null,
      beginYear: hit['life-span']?.begin ? Number(hit['life-span'].begin.slice(0, 4)) || null : null,
      tags: hit.tags ?? [],
      genres,
      tagLanguage,
      wikidataQid: null,
      languages: [],
    });
  }
  return [...best.values()];
}

/** Tags are human-curated, so reading them is evidence rather than inference. */
function deriveFromTags(tags: MbTag[]): { genres: string[]; tagLanguage: string | null } {
  const sorted = [...tags].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const genres: string[] = [];
  let tagLanguage: string | null = null;
  for (const tag of sorted) {
    const name = tag.name.toLowerCase().trim();
    if (genres.length < MAX_GENRES && GENRE_SET.has(name)) genres.push(name);
    if (!tagLanguage && LANGUAGE_TAG_MAP[name]) tagLanguage = LANGUAGE_TAG_MAP[name];
  }
  return { genres, tagLanguage };
}

async function storeArtist(fact: ArtistFacts): Promise<void> {
  await db.query(
    `INSERT INTO music.artists (name, mbid, country, begin_year, tags, wikidata_qid, languages, enriched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (lower(name)) DO UPDATE SET
       mbid = COALESCE(EXCLUDED.mbid, music.artists.mbid),
       country = COALESCE(EXCLUDED.country, music.artists.country),
       begin_year = COALESCE(EXCLUDED.begin_year, music.artists.begin_year),
       tags = EXCLUDED.tags,
       wikidata_qid = COALESCE(EXCLUDED.wikidata_qid, music.artists.wikidata_qid),
       languages = EXCLUDED.languages,
       enriched_at = now()`,
    [
      fact.name,
      fact.mbid,
      fact.country,
      fact.beginYear,
      JSON.stringify(fact.tags),
      fact.wikidataQid,
      fact.languages,
    ],
  );
}

type StoredArtist = {
  name: string;
  country: string | null;
  tags: unknown;
  languages: string[];
};

async function loadStoredArtists(names: string[]): Promise<StoredArtist[]> {
  const res = await db.query<StoredArtist>(
    `SELECT name, country, tags, languages FROM music.artists
     WHERE lower(name) = ANY($1::text[])`,
    [names.map((n) => n.toLowerCase())],
  );
  return res.rows;
}

/** Writes region/genres for the artist's tracks and resolves each title's language. */
async function applyToTracks(artist: StoredArtist): Promise<number> {
  const region = regionFromCountry(artist.country);
  const { genres, tagLanguage } = deriveFromTags(normalizeStoredTags(artist.tags));

  const tracks = await db.query<{ id: string; title: string; language: string }>(
    `SELECT t.id, t.title, COALESCE(tf.language, 'unknown') AS language
     FROM music.tracks t
     LEFT JOIN music.track_facets tf ON tf.track_id = t.id
     WHERE lower(t.artist_name) = lower($1)`,
    [artist.name],
  );

  let touched = 0;
  for (const track of tracks.rows) {
    const language =
      track.language !== 'unknown'
        ? track.language
        : (tagLanguage ??
           // Country fallback is enabled here because this is the final tier:
           // the lyrics were already tried during the scan.
           resolveLanguage(track.title, artist.country, artist.languages ?? [], true));

    if (region === 'unknown' && genres.length === 0 && !language) continue;

    await db.query(
      `UPDATE music.track_facets SET
         region = CASE WHEN $2 <> 'unknown' THEN $2 ELSE region END,
         language = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE language END,
         genres = CASE WHEN cardinality($4::text[]) > 0 THEN $4::text[] ELSE genres END,
         updated_at = now()
       WHERE track_id = $1`,
      [track.id, region, language, genres],
    );
    // The cultural tower just changed, so the fused vector has to follow.
    await refreshItemEmbedding(track.id);
    touched += 1;
  }
  return touched;
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
