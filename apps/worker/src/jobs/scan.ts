import type { Job, Queue } from 'bullmq';
import { db, sleep } from '../db';
import { analyze } from '../lib/ml';
import { resolveTrack } from '../lib/resolve';
import { eraBucket, energyBucket, moodBucket, rarityBucket, tempoBucket } from '../lib/facets';
import { rebuildPortrait, rebuildUserEmbedding } from '../lib/portrait';

type TrackRow = {
  id: string;
  title: string;
  artist_name: string;
  preview_url: string | null;
  release_year: number | null;
  deezer_id: string | null;
  has_audio: boolean;
};

const PORTRAIT_REBUILD_EVERY = 25;

/**
 * Full-library scan: resolve -> analyze -> facets -> embeddings, with
 * incremental portrait rebuilds so the user watches the profile assemble.
 * Ordered by play_count so the portrait is representative early.
 */
export async function processScan(job: Job, mbQueue: Queue): Promise<void> {
  const { userId, trackIds } = job.data as { userId: string; trackIds: string[] };
  if (!trackIds?.length) return;

  const tracksRes = await db.query<TrackRow>(
    `SELECT t.id, t.title, t.artist_name, t.preview_url, t.release_year, t.deezer_id,
            (ta.track_id IS NOT NULL) AS has_audio
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

  // Cultural graph enrichment trickles behind (1 req/s limiter on the MB queue).
  // jobId dedupes an artist already queued; an already-enriched artist is skipped in the processor.
  for (const artist of artists) {
    await mbQueue.add(
      'enrich',
      { artistName: artist, userId },
      { jobId: `mb:${artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)}` },
    );
  }
}

async function processTrack(track: TrackRow): Promise<void> {
  let { preview_url, release_year } = track;
  let deezerRank: number | null = null;
  let deezerBpm: number | null = null;

  if (!preview_url) {
    const resolved = await resolveTrack(track.title, track.artist_name);
    preview_url = resolved.previewUrl;
    release_year = release_year ?? resolved.releaseYear;
    deezerRank = resolved.deezerRank;
    deezerBpm = resolved.deezerBpm;

    await db.query(
      `UPDATE music.tracks SET
         preview_url = COALESCE($2, preview_url),
         release_year = COALESCE($3, release_year),
         deezer_id = COALESCE($4, deezer_id),
         itunes_id = COALESCE($5, itunes_id)
       WHERE id = $1`,
      [track.id, resolved.previewUrl, resolved.releaseYear, resolved.deezerId, resolved.itunesId],
    );
  }

  let tempo: number | null = deezerBpm;
  let energy: number | null = null;
  let valence: number | null = null;

  if (preview_url && !track.has_audio) {
    const audio = await analyze(track.id, preview_url);
    if (audio) {
      tempo = deezerBpm ?? audio.tempo_bpm;
      energy = audio.energy;
      valence = audio.valence;

      await db.query(
        `INSERT INTO music.track_audio (track_id, tempo_bpm, energy, valence, key, mode)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (track_id) DO UPDATE SET
           tempo_bpm = EXCLUDED.tempo_bpm, energy = EXCLUDED.energy, valence = EXCLUDED.valence,
           key = EXCLUDED.key, mode = EXCLUDED.mode, analyzed_at = now()`,
        [track.id, tempo, energy, valence, audio.key, audio.mode],
      );
      await db.query(
        `INSERT INTO taste.item_embeddings (track_id, embedding)
         VALUES ($1, $2::vector)
         ON CONFLICT (track_id) DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()`,
        [track.id, `[${audio.embedding.join(',')}]`],
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

  // Region and language belong to MusicBrainz enrichment — never touched here,
  // so a rescan can't reset them to unknown.
  await db.query(
    `INSERT INTO music.track_facets (track_id, era, tempo, energy, mood, rarity)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (track_id) DO UPDATE SET
       era = EXCLUDED.era, tempo = EXCLUDED.tempo, energy = EXCLUDED.energy,
       mood = EXCLUDED.mood, rarity = EXCLUDED.rarity, updated_at = now()`,
    [
      track.id,
      eraBucket(release_year),
      tempoBucket(tempo),
      energyBucket(energy),
      moodBucket(energy, valence),
      rarityBucket(deezerRank),
    ],
  );
}
