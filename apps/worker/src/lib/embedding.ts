import { createHash } from 'node:crypto';
import { db } from '../db';

/**
 * Two-tower item representation, fused into the 256-dim vector the database
 * searches over.
 *
 *   acoustic tower (64)  — librosa measurements of the 30s preview
 *   cultural tower (192) — where the music sits in the semantic graph:
 *                          genres, region, language, era, popularity
 *
 * Each tower is L2-normalised on its own, then weighted and concatenated, so
 * a track with no audio still has a usable position from culture alone and
 * vice versa — the graceful degradation the architecture depends on.
 *
 * The fusion weights are fixed rather than learned. Learning them (and the
 * projections) needs offline training on listening histories; the vectors
 * written here are exactly the inputs that training will consume, so the
 * shape does not change when the trained weights land.
 */
const ACOUSTIC_DIM = 64;
const CULTURAL_DIM = 192;
export const ITEM_DIM = ACOUSTIC_DIM + CULTURAL_DIM;

const ACOUSTIC_WEIGHT = 0.6;
const CULTURAL_WEIGHT = 0.4;

/** Stable feature hashing: one token lights up a few dimensions, always the same ones. */
function hashInto(target: Float64Array, token: string, weight: number): void {
  const digest = createHash('sha256').update(token).digest();
  for (let i = 0; i < 3; i += 1) {
    const slot = digest.readUInt32BE(i * 4) % CULTURAL_DIM;
    const sign = (digest[12 + i] & 1) === 0 ? 1 : -1;
    target[slot] += sign * weight;
  }
}

function l2(vector: Float64Array): Float64Array {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return vector.map((v) => v / norm) as Float64Array;
}

type Facets = {
  genres: string[] | null;
  region: string | null;
  language: string | null;
  era: string | null;
  mood: string | null;
  rarity: string | null;
};

export function culturalVector(facets: Facets): Float64Array {
  const vector = new Float64Array(CULTURAL_DIM);
  // Genres carry the most cultural signal, so they get the largest weight and
  // decay by rank — the first tag describes the music better than the fifth.
  (facets.genres ?? []).forEach((genre, index) => {
    hashInto(vector, `genre:${genre}`, 1 / (1 + index * 0.5));
  });
  if (facets.region && facets.region !== 'unknown') hashInto(vector, `region:${facets.region}`, 0.8);
  if (facets.language && facets.language !== 'unknown') hashInto(vector, `lang:${facets.language}`, 0.8);
  if (facets.era && facets.era !== 'unknown') hashInto(vector, `era:${facets.era}`, 0.5);
  if (facets.mood && facets.mood !== 'unknown') hashInto(vector, `mood:${facets.mood}`, 0.4);
  if (facets.rarity && facets.rarity !== 'unknown') hashInto(vector, `rarity:${facets.rarity}`, 0.3);
  return l2(vector);
}

/** Reads both towers for a track from the database and writes the fused vector. */
export async function refreshItemEmbedding(trackId: string): Promise<void> {
  const res = await db.query<{
    acoustic: string | null;
    genres: string[] | null;
    region: string | null;
    language: string | null;
    era: string | null;
    mood: string | null;
    rarity: string | null;
  }>(
    `SELECT ta.acoustic::text AS acoustic,
            tf.genres, tf.region, tf.language, tf.era, tf.mood, tf.rarity
     FROM music.tracks t
     LEFT JOIN music.track_audio ta ON ta.track_id = t.id
     LEFT JOIN music.track_facets tf ON tf.track_id = t.id
     WHERE t.id = $1`,
    [trackId],
  );
  const row = res.rows[0];
  if (!row) return;

  const acoustic = new Float64Array(ACOUSTIC_DIM);
  if (row.acoustic) {
    const parsed = JSON.parse(row.acoustic) as number[];
    parsed.slice(0, ACOUSTIC_DIM).forEach((v, i) => {
      acoustic[i] = v;
    });
  }
  const cultural = culturalVector(row);

  const hasAcoustic = row.acoustic !== null;
  const hasCultural = (row.genres?.length ?? 0) > 0 || (row.region ?? 'unknown') !== 'unknown';
  if (!hasAcoustic && !hasCultural) return;

  // A missing tower must not shrink the vector toward the origin, so the
  // present tower takes the full weight instead.
  const aw = hasAcoustic ? (hasCultural ? ACOUSTIC_WEIGHT : 1) : 0;
  const cw = hasCultural ? (hasAcoustic ? CULTURAL_WEIGHT : 1) : 0;

  const fused = new Float64Array(ITEM_DIM);
  for (let i = 0; i < ACOUSTIC_DIM; i += 1) fused[i] = acoustic[i] * aw;
  for (let i = 0; i < CULTURAL_DIM; i += 1) fused[ACOUSTIC_DIM + i] = cultural[i] * cw;

  const normalized = l2(fused);
  await db.query(
    `INSERT INTO taste.item_embeddings (track_id, embedding, model_version)
     VALUES ($1, $2::vector, 'two-tower-v1')
     ON CONFLICT (track_id) DO UPDATE SET
       embedding = EXCLUDED.embedding, model_version = EXCLUDED.model_version, updated_at = now()`,
    [trackId, `[${Array.from(normalized).map((v) => v.toFixed(6)).join(',')}]`],
  );
}

/**
 * User tower: the library's item vectors averaged with play count and recency
 * as weights, so what someone actually returns to counts for more than what
 * they imported once.
 */
export async function rebuildUserEmbedding(userId: string): Promise<void> {
  // The weighted mean is computed here rather than in SQL: pgvector has no
  // scalar multiplication operator, so `sum(embedding * weight)` cannot run
  // in the database.
  const res = await db.query<{ embedding: string; weight: string }>(
    `SELECT ie.embedding::text AS embedding,
            ((1 + ln(1 + ut.play_count))
              * CASE
                  WHEN ut.last_played_at IS NULL THEN 1.0
                  ELSE 0.5 + exp(-extract(epoch FROM (now() - ut.last_played_at)) / (86400 * 120))
                END)::text AS weight
     FROM music.user_tracks ut
     JOIN taste.item_embeddings ie ON ie.track_id = ut.track_id
     WHERE ut.user_id = $1
     ORDER BY ut.play_count DESC
     LIMIT 2000`,
    [userId],
  );
  if (res.rows.length === 0) return;

  const summed = new Float64Array(ITEM_DIM);
  let totalWeight = 0;
  for (const row of res.rows) {
    const values = JSON.parse(row.embedding) as number[];
    if (values.length !== ITEM_DIM) continue;
    const weight = Number(row.weight) || 1;
    totalWeight += weight;
    for (let i = 0; i < ITEM_DIM; i += 1) summed[i] += values[i] * weight;
  }
  if (totalWeight === 0) return;
  for (let i = 0; i < ITEM_DIM; i += 1) summed[i] /= totalWeight;

  const normalized = l2(summed);
  await db.query(
    `INSERT INTO taste.user_embeddings (user_id, embedding, model_version)
     VALUES ($1, $2::vector, 'two-tower-v1')
     ON CONFLICT (user_id) DO UPDATE SET
       embedding = EXCLUDED.embedding, model_version = EXCLUDED.model_version, updated_at = now()`,
    [userId, `[${Array.from(normalized).map((v) => v.toFixed(6)).join(',')}]`],
  );
}
