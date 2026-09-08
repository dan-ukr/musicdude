import { Injectable, NotFoundException } from '@nestjs/common';
import type { CardReason, DailyCard, DailyCardAction } from '@musicdude/shared';
import { PgService } from '../database/pg.service';

type CandidateRow = {
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
  genres: string[];
  first_played_at: string | null;
};

/**
 * Track of the Day. Drawn from the user's own library and its nearest cultural
 * adjacency — never a world catalogue — and always carrying one bridge
 * sentence, which stays free per the spec.
 *
 * "More of this" follows the inertia; "get me out" applies the iso-principle:
 * the next card steps one notch lighter instead of deepening the spiral.
 */
@Injectable()
export class DailyCardService {
  constructor(private readonly pg: PgService) {}

  async today(userId: string): Promise<DailyCard> {
    const existing = await this.pg.query<{
      track_id: string;
      reason_template: string;
      reason_params: Record<string, string>;
      action: DailyCardAction | null;
      local_date: string;
    }>(
      `SELECT track_id, reason_template, reason_params, action, local_date::text
       FROM music.daily_cards WHERE user_id = $1 AND local_date = current_date`,
      [userId],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const track = await this.loadTrack(userId, row.track_id);
      return {
        track,
        reason: { template: row.reason_template, params: row.reason_params ?? {} },
        date: row.local_date,
        action: row.action,
      };
    }
    return this.generate(userId, null);
  }

  /** Records the response and immediately serves the next card it implies. */
  async act(userId: string, action: DailyCardAction): Promise<DailyCard> {
    await this.pg.query(
      `UPDATE music.daily_cards SET action = $2 WHERE user_id = $1 AND local_date = current_date`,
      [userId, action],
    );
    return this.generate(userId, action);
  }

  private async generate(userId: string, action: DailyCardAction | null): Promise<DailyCard> {
    // Recent listening is the window; 'get me out' deliberately leaves it.
    const recentMood = await this.pg.query<{ mood: string }>(
      `SELECT tf.mood
       FROM music.user_tracks ut
       JOIN music.track_facets tf ON tf.track_id = ut.track_id
       WHERE ut.user_id = $1 AND tf.mood <> 'unknown'
       GROUP BY tf.mood ORDER BY sum(ut.play_count) DESC, count(*) DESC LIMIT 1`,
      [userId],
    );
    const dominantMood = recentMood.rows[0]?.mood ?? null;

    const moodClause =
      action === 'get-me-out' && dominantMood
        ? `AND tf.mood <> '${dominantMood.replace(/'/g, '')}'`
        : action === 'more-of-this' && dominantMood
          ? `AND tf.mood = '${dominantMood.replace(/'/g, '')}'`
          : '';

    const candidates = await this.pg.query<CandidateRow>(
      `SELECT t.id, t.title, t.artist_name, t.preview_url, t.artwork_url, t.release_year,
              tf.language, tf.mood, tf.era, tf.region, tf.genres, ut.first_played_at::text
       FROM music.user_tracks ut
       JOIN music.tracks t ON t.id = ut.track_id
       JOIN music.track_facets tf ON tf.track_id = t.id
       WHERE ut.user_id = $1
         AND t.preview_url IS NOT NULL
         ${moodClause}
         AND NOT EXISTS (
           SELECT 1 FROM music.daily_cards dc
           WHERE dc.user_id = $1 AND dc.track_id = t.id
             AND dc.local_date > current_date - interval '30 days'
         )
       ORDER BY random() LIMIT 1`,
      [userId],
    );

    let row = candidates.rows[0];
    if (!row) {
      // Nothing left under the constraint: fall back to any playable track.
      const any = await this.pg.query<CandidateRow>(
        `SELECT t.id, t.title, t.artist_name, t.preview_url, t.artwork_url, t.release_year,
                tf.language, tf.mood, tf.era, tf.region, tf.genres, ut.first_played_at::text
         FROM music.user_tracks ut
         JOIN music.tracks t ON t.id = ut.track_id
         JOIN music.track_facets tf ON tf.track_id = t.id
         WHERE ut.user_id = $1 ORDER BY random() LIMIT 1`,
        [userId],
      );
      row = any.rows[0];
    }
    if (!row) throw new NotFoundException('Import music first');

    const reason = buildReason(row, action, dominantMood);

    await this.pg.query(
      `INSERT INTO music.daily_cards (user_id, local_date, track_id, reason_template, reason_params)
       VALUES ($1, current_date, $2, $3, $4)
       ON CONFLICT (user_id, local_date) DO UPDATE SET
         track_id = EXCLUDED.track_id,
         reason_template = EXCLUDED.reason_template,
         reason_params = EXCLUDED.reason_params`,
      [userId, row.id, reason.template, JSON.stringify(reason.params)],
    );

    return {
      track: {
        id: row.id,
        title: row.title,
        artist: row.artist_name,
        previewUrl: row.preview_url,
        artworkUrl: row.artwork_url,
        releaseYear: row.release_year,
        facets: null,
      },
      reason,
      date: new Date().toISOString().slice(0, 10),
      action: null,
    };
  }

  private async loadTrack(userId: string, trackId: string) {
    const res = await this.pg.query<CandidateRow>(
      `SELECT t.id, t.title, t.artist_name, t.preview_url, t.artwork_url, t.release_year,
              tf.language, tf.mood, tf.era, tf.region, tf.genres, ut.first_played_at::text
       FROM music.tracks t
       LEFT JOIN music.track_facets tf ON tf.track_id = t.id
       LEFT JOIN music.user_tracks ut ON ut.track_id = t.id AND ut.user_id = $2
       WHERE t.id = $1`,
      [trackId, userId],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundException();
    return {
      id: row.id,
      title: row.title,
      artist: row.artist_name,
      previewUrl: row.preview_url,
      artworkUrl: row.artwork_url,
      releaseYear: row.release_year,
      facets: null,
    };
  }
}

/**
 * Scripted templates, not an LLM: every sentence is a translatable phrase key
 * with named values, so the reason reads correctly in all 11 languages.
 */
function buildReason(
  row: CandidateRow,
  action: DailyCardAction | null,
  dominantMood: string | null,
): CardReason {
  const genre = row.genres?.[0];

  if (action === 'get-me-out' && dominantMood && row.mood !== 'unknown') {
    return { template: 'One step out of your {from} stretch — this one is {to}', params: { from: dominantMood, to: row.mood } };
  }
  if (action === 'more-of-this' && row.mood !== 'unknown') {
    return { template: 'More of the {mood} run you are on', params: { mood: row.mood } };
  }
  if (genre && row.region !== 'unknown') {
    return { template: 'A bridge between your {genre} and {region} sides', params: { genre, region: row.region } };
  }
  if (row.language !== 'unknown' && row.era !== 'unknown') {
    return { template: 'Your {language} side, from {era}', params: { language: row.language, era: row.era } };
  }
  if (genre) {
    return { template: 'Rare in your library: {genre}', params: { genre } };
  }
  if (row.first_played_at) {
    return {
      template: 'You loved this in {year} — remember?',
      params: { year: row.first_played_at.slice(0, 4) },
    };
  }
  return { template: 'From the quieter corner of your library', params: {} };
}
