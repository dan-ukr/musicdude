import { db } from '../db';

type FacetRow = { facet: string; value: string; count: string };

/** Aggregate the user's facet index into a portrait snapshot (cheap SQL, safe to rerun). */
export async function rebuildPortrait(userId: string): Promise<void> {
  const res = await db.query<FacetRow>(
    `SELECT f.facet, f.value, count(*)::text AS count
     FROM music.user_tracks ut
     JOIN music.track_facets tf ON tf.track_id = ut.track_id
     CROSS JOIN LATERAL (VALUES
       ('era', tf.era), ('region', tf.region), ('language', tf.language), ('mood', tf.mood)
     ) AS f(facet, value)
     WHERE ut.user_id = $1
     GROUP BY f.facet, f.value`,
    [userId],
  );

  const trackCountRes = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM music.user_tracks WHERE user_id = $1`,
    [userId],
  );

  const genreRes = await db.query<{ value: string; count: string }>(
    `SELECT g.value, count(*)::text AS count
     FROM music.user_tracks ut
     JOIN music.track_facets tf ON tf.track_id = ut.track_id
     CROSS JOIN LATERAL unnest(tf.genres) AS g(value)
     WHERE ut.user_id = $1
     GROUP BY g.value
     ORDER BY count(*) DESC
     LIMIT 25`,
    [userId],
  );

  const dist = (facet: string): Record<string, number> =>
    Object.fromEntries(
      res.rows.filter((r) => r.facet === facet).map((r) => [r.value, Number(r.count)]),
    );

  const payload = {
    rarityPercentile: null,
    eraDistribution: dist('era'),
    regionDistribution: dist('region'),
    languageDistribution: dist('language'),
    moodDistribution: dist('mood'),
    genreDistribution: Object.fromEntries(genreRes.rows.map((r) => [r.value, Number(r.count)])),
    trackCount: Number(trackCountRes.rows[0]?.count ?? 0),
    generatedAt: new Date().toISOString(),
  };

  // Keep only the latest snapshot per user for now (history becomes the Change tab later).
  await db.query(`DELETE FROM taste.portrait_snapshots WHERE user_id = $1`, [userId]);
  await db.query(
    `INSERT INTO taste.portrait_snapshots (user_id, payload) VALUES ($1, $2)`,
    [userId, JSON.stringify(payload)],
  );
}

/** User embedding = average of item embeddings over the library (play-weighting comes later). */
export async function rebuildUserEmbedding(userId: string): Promise<void> {
  await db.query(
    `INSERT INTO taste.user_embeddings (user_id, embedding)
     SELECT $1, avg(ie.embedding)
     FROM taste.item_embeddings ie
     JOIN music.user_tracks ut ON ut.track_id = ie.track_id
     WHERE ut.user_id = $1
     HAVING count(*) > 0
     ON CONFLICT (user_id) DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()`,
    [userId],
  );
}
