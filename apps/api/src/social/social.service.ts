import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Comparison, FriendSummary, ShareCode } from '@musicdude/shared';
import { PgService } from '../database/pg.service';

/**
 * Pairwise social, built on the taste vector only. Mood is never shared — not
 * optionally, not on request: a friend seeing that you are unwell makes people
 * self-conscious about what they play, which corrupts the very signal the mood
 * features depend on.
 */
@Injectable()
export class SocialService {
  constructor(private readonly pg: PgService) {}

  async myCode(userId: string): Promise<ShareCode> {
    const existing = await this.pg.query<{ code: string }>(
      `SELECT code FROM social.share_codes WHERE user_id = $1`,
      [userId],
    );
    if (existing.rows[0]) return { code: existing.rows[0].code };

    const code = randomBytes(4).toString('hex').toUpperCase();
    await this.pg.query(
      `INSERT INTO social.share_codes (code, user_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code`,
      [code, userId],
    );
    return { code };
  }

  async compare(userId: string, code: string): Promise<Comparison> {
    const other = await this.resolveCode(code);
    if (other.userId === userId) throw new BadRequestException('That is your own code');

    const matchPct = await this.matchPct(userId, other.userId);
    const bridgeTracks = await this.bridgeTracks(userId, other.userId);
    const sharedFacets = await this.sharedFacets(userId, other.userId);
    const friend = await this.pg.query(
      `SELECT 1 FROM social.friends WHERE user_id = $1 AND friend_user_id = $2`,
      [userId, other.userId],
    );

    return {
      otherName: other.name,
      matchPct,
      bridgeTracks,
      sharedFacets,
      isFriend: friend.rows.length > 0,
    };
  }

  /** Saving a friend keeps the comparison alive over time — a premium feature. */
  async addFriend(userId: string, code: string): Promise<FriendSummary> {
    const other = await this.resolveCode(code);
    if (other.userId === userId) throw new BadRequestException('That is your own code');
    const matchPct = await this.matchPct(userId, other.userId);

    await this.pg.query(
      `INSERT INTO social.friends (user_id, friend_user_id, match_pct) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, friend_user_id) DO UPDATE SET match_pct = EXCLUDED.match_pct`,
      [userId, other.userId, matchPct],
    );
    // Mutual by construction: both sides see the pair.
    await this.pg.query(
      `INSERT INTO social.friends (user_id, friend_user_id, match_pct) VALUES ($2, $1, $3)
       ON CONFLICT (user_id, friend_user_id) DO UPDATE SET match_pct = EXCLUDED.match_pct`,
      [userId, other.userId, matchPct],
    );

    return { userId: other.userId, name: other.name, matchPct, since: new Date().toISOString() };
  }

  async friends(userId: string): Promise<FriendSummary[]> {
    const res = await this.pg.query<{
      friend_user_id: string;
      name: string | null;
      email: string;
      match_pct: number | null;
      created_at: string;
    }>(
      `SELECT f.friend_user_id, u.first_name AS name, u.email, f.match_pct, f.created_at
       FROM social.friends f
       JOIN core.users u ON u.id = f.friend_user_id
       WHERE f.user_id = $1
       ORDER BY f.match_pct DESC NULLS LAST`,
      [userId],
    );
    return res.rows.map((r) => ({
      userId: r.friend_user_id,
      name: r.name ?? r.email.split('@')[0],
      matchPct: r.match_pct ?? 0,
      since: r.created_at,
    }));
  }

  private async resolveCode(code: string): Promise<{ userId: string; name: string }> {
    const res = await this.pg.query<{ user_id: string; first_name: string | null; email: string }>(
      `SELECT s.user_id, u.first_name, u.email
       FROM social.share_codes s JOIN core.users u ON u.id = s.user_id
       WHERE upper(s.code) = upper($1)`,
      [code.trim()],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundException('No one uses that code');
    return { userId: row.user_id, name: row.first_name ?? row.email.split('@')[0] };
  }

  /**
   * Facet overlap rather than raw embedding distance: it is explainable
   * ("you both live in eastern-europe and melancholic") and stable while
   * libraries are small.
   */
  private async matchPct(a: string, b: string): Promise<number> {
    const res = await this.pg.query<{ shared: number; total: number }>(
      `WITH profile AS (
         SELECT ut.user_id, f.facet, f.value, count(*)::int AS n
         FROM music.user_tracks ut
         JOIN music.track_facets tf ON tf.track_id = ut.track_id
         CROSS JOIN LATERAL (VALUES
           ('language', tf.language), ('mood', tf.mood), ('era', tf.era), ('region', tf.region)
         ) AS f(facet, value)
         WHERE ut.user_id IN ($1, $2) AND f.value <> 'unknown'
         GROUP BY ut.user_id, f.facet, f.value
       ), mine AS (SELECT facet, value, n FROM profile WHERE user_id = $1),
          theirs AS (SELECT facet, value, n FROM profile WHERE user_id = $2)
       SELECT
         (SELECT coalesce(sum(least(m.n, t.n)), 0)::int FROM mine m JOIN theirs t
            ON t.facet = m.facet AND t.value = m.value) AS shared,
         (SELECT greatest(
            (SELECT coalesce(sum(n),0) FROM mine),
            (SELECT coalesce(sum(n),0) FROM theirs), 1)::int) AS total`,
      [a, b],
    );
    const { shared, total } = res.rows[0] ?? { shared: 0, total: 1 };
    return Math.min(100, Math.round((shared / total) * 100));
  }

  /** Tracks both libraries hold — each side thought it was only theirs. */
  private async bridgeTracks(a: string, b: string) {
    const res = await this.pg.query<{
      title: string;
      artist_name: string;
      preview_url: string | null;
      artwork_url: string | null;
    }>(
      `SELECT t.title, t.artist_name, t.preview_url, t.artwork_url
       FROM music.user_tracks mine
       JOIN music.user_tracks theirs ON theirs.track_id = mine.track_id AND theirs.user_id = $2
       JOIN music.tracks t ON t.id = mine.track_id
       LEFT JOIN music.track_facets tf ON tf.track_id = t.id
       WHERE mine.user_id = $1
       ORDER BY (tf.rarity IN ('rare', 'niche')) DESC NULLS LAST,
                mine.play_count + theirs.play_count DESC
       LIMIT 3`,
      [a, b],
    );
    return res.rows.map((r) => ({
      title: r.title,
      artist: r.artist_name,
      previewUrl: r.preview_url,
      artworkUrl: r.artwork_url,
    }));
  }

  private async sharedFacets(a: string, b: string) {
    const res = await this.pg.query<{ facet: string; value: string }>(
      `WITH profile AS (
         SELECT ut.user_id, f.facet, f.value, count(*)::int AS n
         FROM music.user_tracks ut
         JOIN music.track_facets tf ON tf.track_id = ut.track_id
         CROSS JOIN LATERAL (VALUES
           ('language', tf.language), ('mood', tf.mood), ('era', tf.era),
           ('region', tf.region)
         ) AS f(facet, value)
         WHERE ut.user_id IN ($1, $2) AND f.value <> 'unknown'
         GROUP BY ut.user_id, f.facet, f.value
       )
       SELECT m.facet, m.value
       FROM profile m JOIN profile t
         ON t.facet = m.facet AND t.value = m.value AND t.user_id = $2
       WHERE m.user_id = $1
       ORDER BY least(m.n, t.n) DESC
       LIMIT 5`,
      [a, b],
    );
    return res.rows;
  }
}
