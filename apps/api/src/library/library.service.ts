import { Injectable } from '@nestjs/common';
import type { DiscoverTrack, FacetQuery, LibraryFacets, TrackSummary } from '@musicdude/shared';
import { PgService } from '../database/pg.service';

/**
 * Compatibility is a percentile, not a rescaled cosine.
 *
 * Measured across a real library the similarity distribution is bimodal — the
 * median sits at 0.03 while the 95th percentile is 0.86 — because the cultural
 * half of the vector is feature-hashed and unrelated tracks land near
 * orthogonal. Any fixed floor therefore prints 0% for almost everything. Ranking
 * each candidate against the whole pool gives a number that means something the
 * user can act on: "this is in the top few percent of what we could show you".
 */

type TrackRow = {
  id: string;
  title: string;
  artist_name: string;
  preview_url: string | null;
  artwork_url: string | null;
  release_year: number | null;
  language: string;
  mood: string;
  era: string;
  region: string;
  tempo: string;
  energy: string;
  rarity: string;
  genres: string[];
};

const SIMPLE_FACETS = ['language', 'mood', 'era', 'region', 'tempo', 'energy', 'rarity'] as const;

@Injectable()
export class LibraryService {
  constructor(private readonly pg: PgService) {}

  /** Facet values present in this user's library, with counts, for the chips. */
  async facets(userId: string): Promise<LibraryFacets> {
    const simple = await this.pg.query<{ facet: string; value: string; count: number }>(
      `SELECT f.facet, f.value, count(*)::int AS count
       FROM music.user_tracks ut
       JOIN music.track_facets tf ON tf.track_id = ut.track_id
       CROSS JOIN LATERAL (VALUES
         ('language', tf.language), ('mood', tf.mood), ('era', tf.era),
         ('region', tf.region), ('tempo', tf.tempo), ('energy', tf.energy),
         ('rarity', tf.rarity)
       ) AS f(facet, value)
       WHERE ut.user_id = $1
       GROUP BY f.facet, f.value
       ORDER BY count DESC`,
      [userId],
    );

    const genres = await this.pg.query<{ value: string; count: number }>(
      `SELECT g.value, count(*)::int AS count
       FROM music.user_tracks ut
       JOIN music.track_facets tf ON tf.track_id = ut.track_id
       CROSS JOIN LATERAL unnest(tf.genres) AS g(value)
       WHERE ut.user_id = $1
       GROUP BY g.value ORDER BY count DESC LIMIT 40`,
      [userId],
    );

    const out = {
      genre: genres.rows.map((r) => ({ value: r.value, count: r.count })),
    } as LibraryFacets;
    for (const facet of SIMPLE_FACETS) {
      out[facet] = simple.rows
        .filter((r) => r.facet === facet)
        .map((r) => ({ value: r.value, count: r.count }));
    }
    return out;
  }

  async tracks(userId: string, query: FacetQuery, limit = 100, offset = 0): Promise<TrackSummary[]> {
    const { where, params } = this.buildWhere(userId, query);
    const res = await this.pg.query<TrackRow>(
      `SELECT t.id, t.title, t.artist_name, t.preview_url, t.artwork_url, t.release_year,
              tf.language, tf.mood, tf.era, tf.region, tf.tempo, tf.energy, tf.rarity, tf.genres
       FROM music.user_tracks ut
       JOIN music.tracks t ON t.id = ut.track_id
       JOIN music.track_facets tf ON tf.track_id = t.id
       WHERE ${where}
       ORDER BY ut.play_count DESC, t.title ASC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return res.rows.map(toSummary);
  }

  /** Track ids matching a filter — used when a playlist is created. */
  async trackIds(userId: string, query: FacetQuery, limit = 200): Promise<string[]> {
    const { where, params } = this.buildWhere(userId, query);
    const res = await this.pg.query<{ track_id: string }>(
      `SELECT ut.track_id
       FROM music.user_tracks ut
       JOIN music.track_facets tf ON tf.track_id = ut.track_id
       WHERE ${where}
       ORDER BY ut.play_count DESC
       LIMIT ${limit}`,
      params,
    );
    return res.rows.map((r) => r.track_id);
  }

  /**
   * Nearest cultural adjacency inside the catalogue: tracks the user does not
   * own, closest to the filtered set in embedding space. This is the premium
   * "my tracks + recommended" blend — v1 never generates from a world catalogue.
   */
  async recommendedForQuery(userId: string, query: FacetQuery, limit = 20): Promise<TrackSummary[]> {
    const { where, params } = this.buildWhere(userId, query);
    const res = await this.pg.query<TrackRow>(
      `WITH seed AS (
         SELECT avg(ie.embedding) AS centroid
         FROM music.user_tracks ut
         JOIN music.track_facets tf ON tf.track_id = ut.track_id
         JOIN taste.item_embeddings ie ON ie.track_id = ut.track_id
         WHERE ${where}
       )
       SELECT t.id, t.title, t.artist_name, t.preview_url, t.artwork_url, t.release_year,
              tf.language, tf.mood, tf.era, tf.region, tf.tempo, tf.energy, tf.rarity, tf.genres
       FROM taste.item_embeddings ie
       JOIN music.tracks t ON t.id = ie.track_id
       JOIN music.track_facets tf ON tf.track_id = t.id
       CROSS JOIN seed
       WHERE seed.centroid IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM music.user_tracks own
           WHERE own.user_id = $1 AND own.track_id = t.id
         )
       ORDER BY ie.embedding <-> seed.centroid
       LIMIT ${limit}`,
      params,
    );
    return res.rows.map(toSummary);
  }

  /**
   * Nearest neighbours to the user tower, excluding what they already own.
   * Guardrails keep suggestions inside the neighbourhood rather than drifting
   * to whatever is merely closest in the vector space.
   */
  async forYou(userId: string, limit = 20): Promise<TrackSummary[]> {
    const res = await this.pg.query<TrackRow>(
      `SELECT t.id, t.title, t.artist_name, t.preview_url, t.artwork_url, t.release_year,
              tf.language, tf.mood, tf.era, tf.region, tf.tempo, tf.energy, tf.rarity, tf.genres
       FROM taste.user_embeddings ue
       JOIN taste.item_embeddings ie ON true
       JOIN music.tracks t ON t.id = ie.track_id
       JOIN music.track_facets tf ON tf.track_id = t.id
       WHERE ue.user_id = $1
         AND t.preview_url IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM music.user_tracks own
           WHERE own.user_id = $1 AND own.track_id = t.id
         )
       ORDER BY ie.embedding <=> ue.embedding
       LIMIT ${limit}`,
      [userId],
    );
    return res.rows.map(toSummary);
  }

  /**
   * Browse the catalogue rather than the user's own library, with the same
   * filters, and score each result against their taste.
   *
   * Cosine on the fused vectors clusters high (real neighbours sit around
   * 0.7-0.95), so the raw number would read as "everything is a 90% match".
   * COMPAT_FLOOR rescales the band people actually see into 0-100 — a
   * presentation choice, not a claim of extra precision.
   */
  async discover(userId: string, query: FacetQuery, limit = 40): Promise<DiscoverTrack[]> {
    const { where, params } = this.buildWhere(userId, query, 'catalogue');
    const res = await this.pg.query<TrackRow & { pct: number }>(
      `WITH scored AS (
         SELECT ie.track_id,
                1 - (ie.embedding <=> ue.embedding) AS sim
         FROM taste.user_embeddings ue
         JOIN taste.item_embeddings ie ON true
         WHERE ue.user_id = $1
       ), ranked AS (
         SELECT track_id, sim, percent_rank() OVER (ORDER BY sim) AS pct FROM scored
       )
       SELECT t.id, t.title, t.artist_name, t.preview_url, t.artwork_url, t.release_year,
              tf.language, tf.mood, tf.era, tf.region, tf.tempo, tf.energy, tf.rarity, tf.genres,
              ranked.pct
       FROM ranked
       JOIN music.tracks t ON t.id = ranked.track_id
       JOIN music.track_facets tf ON tf.track_id = t.id
       WHERE ${where}
         AND NOT EXISTS (
           SELECT 1 FROM music.user_tracks own
           WHERE own.user_id = $1 AND own.track_id = t.id
         )
       ORDER BY ranked.sim DESC
       LIMIT ${limit}`,
      params,
    );
    return res.rows.map((r) => ({ ...toSummary(r), compatibility: Math.round(r.pct * 100) }));
  }

  /** Adds a catalogue track to the user's library. */
  async addToLibrary(userId: string, trackId: string): Promise<void> {
    await this.pg.query(
      `INSERT INTO music.user_tracks (user_id, track_id, source)
       VALUES ($1, $2, 'discover')
       ON CONFLICT (user_id, track_id) DO NOTHING`,
      [userId, trackId],
    );
  }

  /** How well one track sits against this user's taste, as a percentile. */
  async compatibility(userId: string, trackId: string): Promise<number | null> {
    const res = await this.pg.query<{ pct: number }>(
      `WITH scored AS (
         SELECT ie.track_id, 1 - (ie.embedding <=> ue.embedding) AS sim
         FROM taste.user_embeddings ue
         JOIN taste.item_embeddings ie ON true
         WHERE ue.user_id = $1
       ), ranked AS (
         SELECT track_id, percent_rank() OVER (ORDER BY sim) AS pct FROM scored
       )
       SELECT pct FROM ranked WHERE track_id = $2`,
      [userId, trackId],
    );
    const pct = res.rows[0]?.pct;
    return pct === undefined ? null : Math.round(pct * 100);
  }

  private buildWhere(userId: string, query: FacetQuery, scope: 'library' | 'catalogue' = 'library') {
    const clauses = [scope === 'library' ? 'ut.user_id = $1' : 'true'];
    const params: unknown[] = [userId];
    for (const facet of SIMPLE_FACETS) {
      const value = query[facet];
      if (value) {
        params.push(value);
        clauses.push(`tf.${facet} = $${params.length}`);
      }
    }
    if (query.genre) {
      params.push(query.genre);
      clauses.push(`$${params.length} = ANY(tf.genres)`);
    }
    return { where: clauses.join(' AND '), params };
  }
}

function toSummary(r: TrackRow): TrackSummary {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist_name,
    previewUrl: r.preview_url,
    artworkUrl: r.artwork_url,
    releaseYear: r.release_year,
    facets: {
      language: r.language,
      mood: r.mood as never,
      era: r.era as never,
      region: r.region as never,
      tempo: r.tempo as never,
      energy: r.energy as never,
      rarity: r.rarity as never,
      genres: r.genres ?? [],
    },
  };
}
