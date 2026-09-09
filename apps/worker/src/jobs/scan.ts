import type { Job, Queue } from 'bullmq';
import { db, sleep } from '../db';
import { analyze } from '../lib/ml';
import { resolveTrack } from '../lib/resolve';
import { eraBucket, energyBucket, moodBucket, rarityBucket, tempoBucket } from '../lib/facets';
import { refreshItemEmbedding, rebuildUserEmbedding } from '../lib/embedding';
import { detectFromTitle } from '../lib/language';
import { languageFromLyrics } from '../lib/lyrics';
import { rebuildPortrait } from '../lib/portrait';

type TrackRow = {
  id: string;
  title: string;
  artist_name: string;
  preview_url: string | null;
  artwork_url: string | null;
  release_year: number | null;
  deezer_id: string | null;
  has_audio: boolean;
};

const PORTRAIT_REBUILD_EVERY = 25;
/** Artists per MusicBrainz request — its query takes OR-joined names. */
const ENRICH_CHUNK = 20;

/**
 * Full-library scan: resolve -> analyze -> facets -> embeddings, with
 * incremental portrait rebuilds so the user watches the profile assemble.
 * Ordered by play_count so the portrait is representative early.
 */
export async function processScan(job: Job, mbQueue: Queue): Promise<void> {
  const { userId, trackIds } = job.data as { userId: string; trackIds: string[] };
  if (!trackIds?.length) return;

  const tracksRes = await db.query<TrackRow>(
    `SELECT t.id, t.title, t.artist_name, t.preview_url, t.artwork_url, t.release_year, t.deezer_id,
            (ta.analyzed AND ta.acoustic IS NOT NULL) AS has_audio
     FROM music.tracks t
     JOIN music.user_tracks ut ON ut.track_id = t.id AND ut.user_id = $1
     LEFT JOIN music.track_audio ta ON ta.track_id = t.id
     WHERE t.id = ANY($2::uuid[])
     ORDER BY ut.play_count DESC, ut.added_at ASC`,
    [userId, trackIds],
  );

  const artists = new Set<string>();
  let processed = 0;

  try {
    for (const track of tracksRes.rows) {
      try {
        await processTrack(track);
      } catch (err) {
        console.error(`[scan] track ${track.id} failed: ${(err as Error).message}`);
      }
      artists.add(track.artist_name);
      processed += 1;

      await db.query(
        `UPDATE music.scan_jobs SET processed = $2, updated_at = now() WHERE user_id = $1`,
        [userId, processed],
      );
      if (processed % PORTRAIT_REBUILD_EVERY === 0) await rebuildPortrait(userId);
      await sleep(100); // stay polite to Deezer/iTunes
    }

    await rebuildPortrait(userId);
    await rebuildUserEmbedding(userId);
    await db.query(
      `UPDATE music.scan_jobs SET state = 'done', processed = total, updated_at = now() WHERE user_id = $1`,
      [userId],
    );
  } catch (err) {
    await db.query(
      `UPDATE music.scan_jobs SET state = 'failed', updated_at = now() WHERE user_id = $1`,
      [userId],
    );
    throw err;
  }

  // Cultural graph enrichment trickles behind the rate limiter. Artists are sent
  // in chunks because one MusicBrainz query covers many names — per-artist
  // requests exhausted the ~1 req/s budget on a single import.
  // Failures here must not fail the scan: facets and portrait are already committed.
  const chunks = chunk([...artists], ENRICH_CHUNK);
  for (const artistNames of chunks) {
    try {
      await mbQueue.add('enrich', { artistNames, userId });
    } catch (err) {
      console.error(`[scan] could not queue enrichment: ${(err as Error).message}`);
    }
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function processTrack(track: TrackRow): Promise<void> {
  let { preview_url, release_year } = track;
  let deezerRank: number | null = null;
  let deezerBpm: number | null = null;
  let analysisUrl: string | null = null;

  // Resolve whenever anything is still missing, including the analysis: the
  // URL handed to the analyzer must be fresh, since Deezer links expire and a
  // stale one silently degrades a real measurement into a placeholder.
  if (!preview_url || !track.artwork_url || !track.has_audio) {
    const resolved = await resolveTrack(track.title, track.artist_name);
    preview_url = resolved.previewUrl ?? preview_url;
    analysisUrl = resolved.analysisUrl;
    release_year = release_year ?? resolved.releaseYear;
    deezerRank = resolved.deezerRank;
    deezerBpm = resolved.deezerBpm;

    await db.query(
      `UPDATE music.tracks SET
         preview_url = COALESCE($2, preview_url),
         release_year = COALESCE($3, release_year),
         deezer_id = COALESCE($4, deezer_id),
         itunes_id = COALESCE($5, itunes_id),
         artwork_url = COALESCE($6, artwork_url)
       WHERE id = $1`,
      [
        track.id,
        resolved.previewUrl,
        resolved.releaseYear,
        resolved.deezerId,
        resolved.itunesId,
        resolved.artworkUrl,
      ],
    );
  }

  let tempo: number | null = deezerBpm;
  let energy: number | null = null;
  let valence: number | null = null;
  // Falls back to the stored URL when nothing was resolved this run.
  const audioSourceUrl = analysisUrl ?? preview_url;

  // has_audio means "measured by the current analyzer": rows left by the old
  // placeholder engine are re-analysed rather than trusted.
  if (audioSourceUrl && !track.has_audio) {
    const audio = await analyze(track.id, audioSourceUrl);
    if (audio) {
      tempo = deezerBpm ?? audio.tempo_bpm;
      energy = audio.energy;
      valence = audio.valence;

      await db.query(
        `INSERT INTO music.track_audio
           (track_id, tempo_bpm, energy, valence, key, mode, brightness, dynamism, analyzed, acoustic)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)
         ON CONFLICT (track_id) DO UPDATE SET
           tempo_bpm = EXCLUDED.tempo_bpm, energy = EXCLUDED.energy, valence = EXCLUDED.valence,
           key = EXCLUDED.key, mode = EXCLUDED.mode, brightness = EXCLUDED.brightness,
           dynamism = EXCLUDED.dynamism, analyzed = EXCLUDED.analyzed,
           acoustic = EXCLUDED.acoustic, analyzed_at = now()`,
        [
          track.id,
          tempo,
          energy,
          valence,
          audio.key,
          audio.mode,
          audio.brightness ?? null,
          audio.dynamism ?? null,
          audio.analyzed ?? false,
          `[${audio.embedding.join(',')}]`,
        ],
      );
    }
  } else if (track.has_audio) {
    const audioRes = await db.query<{ tempo_bpm: number; energy: number; valence: number }>(
      `SELECT tempo_bpm, energy, valence FROM music.track_audio WHERE track_id = $1`,
      [track.id],
    );
    const row = audioRes.rows[0];
    if (row) {
      tempo = row.tempo_bpm;
      energy = row.energy;
      valence = row.valence;
    }
  }

  // Language of the recording, strongest evidence first:
  //   1. its lyrics — the only source that describes the song rather than the
  //      artist, so a Swedish band singing in English reads as English
  //   2. no words at all -> 'instrumental', an answer rather than a gap
  //   3. the title's writing system, when it points at exactly one language
  // Anything still open is left for enrichment, which never overwrites this.
  const fromLyrics = await languageFromLyrics(track.title, track.artist_name);
  const detection = detectFromTitle(track.title);
  const language =
    fromLyrics?.kind === 'instrumental'
      ? 'instrumental'
      : fromLyrics?.kind === 'language'
        ? fromLyrics.code
        : detection && 'code' in detection
          ? detection.code
          : null;

  await db.query(
    `INSERT INTO music.track_facets (track_id, era, tempo, energy, mood, rarity, language)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'unknown'))
     ON CONFLICT (track_id) DO UPDATE SET
       era = EXCLUDED.era, tempo = EXCLUDED.tempo, energy = EXCLUDED.energy,
       mood = EXCLUDED.mood, rarity = EXCLUDED.rarity,
       language = CASE WHEN $7::text IS NOT NULL THEN $7 ELSE track_facets.language END,
       updated_at = now()`,
    [
      track.id,
      eraBucket(release_year),
      tempoBucket(tempo),
      energyBucket(energy),
      moodBucket(energy, valence),
      rarityBucket(deezerRank),
      language,
    ],
  );

  // Fuse the towers once the facets for this track are in place.
  await refreshItemEmbedding(track.id);
}
