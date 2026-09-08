import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { ChangePoint, ChangeSummary } from '@musicdude/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EntitlementsService, FREE_CHANGE_DAYS } from '../billing/entitlements.service';
import { PgService } from '../database/pg.service';

/**
 * How taste moved over time, from when each track entered the library
 * (liked-at from Spotify, played-at from history imports). Free shows the
 * recent window; premium unlocks the whole history.
 */
@Controller('change')
@UseGuards(JwtAuthGuard)
export class ChangeController {
  constructor(
    private readonly pg: PgService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get()
  async change(@Req() req: { user: { userId: string } }): Promise<ChangeSummary> {
    const userId = req.user.userId;
    const premium = await this.entitlements.isPremium(userId);
    const windowClause = premium
      ? ''
      : `AND coalesce(ut.first_played_at, ut.added_at) >= now() - interval '${FREE_CHANGE_DAYS} days'`;

    const timeline = await this.pg.query<ChangePoint & { track_count: number }>(
      `SELECT to_char(date_trunc('month', coalesce(ut.first_played_at, ut.added_at)), 'YYYY-MM') AS month,
              count(*)::int AS track_count,
              mode() WITHIN GROUP (ORDER BY tf.genres[1]) AS "topGenre",
              mode() WITHIN GROUP (ORDER BY nullif(tf.language, 'unknown')) AS "topLanguage",
              mode() WITHIN GROUP (ORDER BY nullif(tf.region, 'unknown')) AS "topRegion"
       FROM music.user_tracks ut
       JOIN music.track_facets tf ON tf.track_id = ut.track_id
       WHERE ut.user_id = $1 ${windowClause}
       GROUP BY 1 ORDER BY 1`,
      [userId],
    );

    // First month a facet value shows up = the month that territory arrived.
    const arrived = await this.pg.query<{ facet: string; value: string; month: string }>(
      `WITH firsts AS (
         SELECT f.facet, f.value,
                min(date_trunc('month', coalesce(ut.first_played_at, ut.added_at))) AS first_month
         FROM music.user_tracks ut
         JOIN music.track_facets tf ON tf.track_id = ut.track_id
         CROSS JOIN LATERAL (VALUES
           ('language', nullif(tf.language, 'unknown')),
           ('region', nullif(tf.region, 'unknown')),
           ('genre', tf.genres[1])
         ) AS f(facet, value)
         WHERE ut.user_id = $1 AND f.value IS NOT NULL
         GROUP BY f.facet, f.value
       )
       SELECT facet, value, to_char(first_month, 'YYYY-MM') AS month
       FROM firsts
       WHERE first_month >= (SELECT max(first_month) - interval '6 months' FROM firsts)
       ORDER BY first_month DESC LIMIT 12`,
      [userId],
    );

    return {
      timeline: timeline.rows.map((r) => ({
        month: r.month,
        trackCount: r.track_count,
        topGenre: r.topGenre ?? null,
        topLanguage: r.topLanguage ?? null,
        topRegion: r.topRegion ?? null,
      })),
      arrived: arrived.rows,
      locked: !premium,
    };
  }
}
