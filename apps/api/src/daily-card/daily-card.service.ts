import { Injectable, NotFoundException } from '@nestjs/common';
import type { CardKind, CardReason, DailyCard, DailyCardAction, TrackSummary } from '@musicdude/shared';
import { PgService } from '../database/pg.service';
import { CandidatesService } from './candidates.service';

type TrackRow = {
  id: string;
  title: string;
  artist_name: string;
  preview_url: string | null;
  artwork_url: string | null;
  release_year: number | null;
  language: string | null;
  mood: string | null;
  era: string | null;
  region: string | null;
  genres: string[] | null;
};

const SELECT_TRACK = `
  t.id, t.title, t.artist_name, t.preview_url, t.artwork_url, t.release_year,
  tf.language, tf.mood, tf.era, tf.region, tf.genres
`;

/**
 * A recommendation has to be something they have not heard. Every candidate
 * query starts from the catalogue and subtracts the user's own library, plus
 * anything already served as a card in the last month.
 */
const UNHEARD = `
  FROM music.tracks t
  JOIN music.track_facets tf ON tf.track_id = t.id
  WHERE t.preview_url IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM music.user_tracks own
                    WHERE own.user_id = $1 AND own.track_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM music.daily_cards d
                    WHERE d.user_id = $1 AND d.track_id = t.id
                      AND d.local_date > current_date - 30)
`;

/**
 * Track of the Day.
 *
 * This is a recommendation, not a shuffle: candidates are ranked against what
 * the person has actually been playing recently, and the reason names the
 * specific tracks the choice came from. Several angles rotate so the card does
 * not become one predictable move, and each carries its own explanation.
 *
 * Drawn from the user's own library and its nearest cultural adjacency — never
 * a world catalogue, per the architecture.
 */
@Injectable()
export class DailyCardService {
  constructor(
    private readonly pg: PgService,
    private readonly candidates: CandidatesService,
  ) {}

  async today(userId: string): Promise<DailyCard> {
    const existing = await this.pg.query<{
      track_id: string;
      reason_template: string;
      reason_params: Record<string, string>;
      kind: CardKind;
      action: DailyCardAction | null;
      local_date: string;
    }>(
      `SELECT track_id, reason_template, reason_params, kind, action, local_date::text
       FROM music.daily_cards WHERE user_id = $1 AND local_date = current_date`,
      [userId],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        track: await this.loadTrack(row.track_id),
        reason: { template: row.reason_template, params: row.reason_params ?? {} },
        kind: row.kind ?? 'similar',
        date: row.local_date,
        action: row.action,
        basedOn: (await this.recentTracks(userId)).slice(0, 3).map(toBasis),
      };
    }
    return this.generate(userId, null);
  }

  async act(userId: string, action: DailyCardAction): Promise<DailyCard> {
    await this.pg.query(
      `UPDATE music.daily_cards SET action = $2 WHERE user_id = $1 AND local_date = current_date`,
      [userId, action],
    );
    return this.generate(userId, action);
  }

  /**
   * What the person has been listening to lately. Real play timestamps when we
   * have them; otherwise the most recently added tracks, which is the best
   * available stand-in until the passive collectors are in place.
   */
  private async recentTracks(userId: string): Promise<TrackRow[]> {
    const played = await this.pg.query<TrackRow>(
      `SELECT DISTINCT ON (t.id) ${SELECT_TRACK}
       FROM music.plays p
       JOIN music.tracks t ON t.id = p.track_id
       LEFT JOIN music.track_facets tf ON tf.track_id = t.id
       WHERE p.user_id = $1 AND p.played_at > now() - interval '48 hours'
       ORDER BY t.id, p.played_at DESC
       LIMIT 20`,
      [userId],
    );
    if (played.rows.length >= 3) return played.rows;

    const recent = await this.pg.query<TrackRow>(
      `SELECT ${SELECT_TRACK}
       FROM music.user_tracks ut
       JOIN music.tracks t ON t.id = ut.track_id
       LEFT JOIN music.track_facets tf ON tf.track_id = t.id
       WHERE ut.user_id = $1
       ORDER BY coalesce(ut.last_played_at, ut.added_at) DESC
       LIMIT 20`,
      [userId],
    );
    return recent.rows;
  }

  private async generate(userId: string, action: DailyCardAction | null): Promise<DailyCard> {
    const recent = await this.recentTracks(userId);
    if (recent.length === 0) throw new NotFoundException('Import music first');

    const basedOn = recent.slice(0, 3).map(toBasis);
    const picked =
      (action ? await this.pickForAction(userId, recent, action) : null) ??
      (await this.pickRotating(userId, recent));

    if (!picked) throw new NotFoundException('Nothing left to recommend today');

    await this.pg.query(
      `INSERT INTO music.daily_cards (user_id, local_date, track_id, reason_template, reason_params, kind)
       VALUES ($1, current_date, $2, $3, $4, $5)
       ON CONFLICT (user_id, local_date) DO UPDATE SET
         track_id = EXCLUDED.track_id, reason_template = EXCLUDED.reason_template,
         reason_params = EXCLUDED.reason_params, kind = EXCLUDED.kind`,
      [userId, picked.track.id, picked.reason.template, JSON.stringify(picked.reason.params), picked.kind],
    );

    return {
      track: toSummary(picked.track),
      reason: picked.reason,
      kind: picked.kind,
      date: new Date().toISOString().slice(0, 10),
      action: null,
      basedOn,
    };
  }

  /** "More of this" follows the run; "get me out" steps one notch lighter. */
  private async pickForAction(userId: string, recent: TrackRow[], action: DailyCardAction) {
    const mood = dominant(recent.map((r) => r.mood));
    if (!mood) return null;

    const rows = await this.pg.query<TrackRow>(
      `SELECT ${SELECT_TRACK} ${UNHEARD}
         AND tf.mood <> 'unknown' AND tf.mood ${action === 'more-of-this' ? '=' : '<>'} $2
       ORDER BY random() LIMIT 1`,
      [userId, mood],
    );
    const track = rows.rows[0];
    if (!track) return null;

    return action === 'more-of-this'
      ? {
          track,
          kind: 'follows-the-mood' as CardKind,
          reason: reason('More of the {mood} run you are on', { mood }),
        }
      : {
          track,
          kind: 'breaks-the-mood' as CardKind,
          reason: reason('One step out of your {from} stretch — this one is {to}', {
            from: mood,
            to: track.mood ?? 'different',
          }),
        };
  }

  /**
   * Rotates through the angles, skipping whichever was used yesterday so the
   * card does not repeat the same move two days running.
   */
  private async pickRotating(userId: string, recent: TrackRow[]) {
    const last = await this.pg.query<{ kind: string }>(
      `SELECT kind FROM music.daily_cards WHERE user_id = $1
       ORDER BY local_date DESC LIMIT 1`,
      [userId],
    );
    const previous = last.rows[0]?.kind;

    const attempts: (() => Promise<{ track: TrackRow; kind: CardKind; reason: CardReason } | null>)[] = [
      () => this.becauseYouPlayed(userId, recent),
      () => this.forgottenFavourite(userId),
      () => this.bridge(userId),
      () => this.deepCut(userId),
    ];
    // Start after the angle used last time.
    const startAt = previous
      ? (['because-you-played', 'forgotten-favourite', 'bridge', 'deep-cut'].indexOf(previous) + 1) %
        attempts.length
      : 0;

    for (let i = 0; i < attempts.length; i += 1) {
      const found = await attempts[(startAt + i) % attempts.length]();
      if (found) return found;
    }
    return null;
  }

  /**
   * Browsed from the catalogue, seeded by an artist they actually played, so
   * the suggestion is something new rather than a reshuffle of our own table.
   */
  private async becauseYouPlayed(userId: string, recent: TrackRow[]) {
    const seeds = [...new Set(recent.map((r) => r.artist_name))];
    const browsed = await this.candidates.browse(userId, seeds);
    const shown = await this.recentlyShown(userId);
    const pick = browsed.find((c) => !shown.has(c.trackId));
    if (!pick) return null;

    const rows = await this.pg.query<TrackRow>(
      `SELECT ${SELECT_TRACK} FROM music.tracks t
       LEFT JOIN music.track_facets tf ON tf.track_id = t.id WHERE t.id = $1`,
      [pick.trackId],
    );
    const track = rows.rows[0];
    if (!track) return null;
    return {
      track,
      kind: 'because-you-played' as CardKind,
      reason: reason('Because you play {artist} — this is next door to them', {
        artist: pick.seedArtist,
      }),
    };
  }

  /**
   * The one angle that deliberately looks inward: something they loved once and
   * have not returned to. Not a discovery, a reminder.
   */
  private async forgottenFavourite(userId: string) {
    const rows = await this.pg.query<TrackRow & { first_played_at: string | null }>(
      `SELECT ${SELECT_TRACK}, ut.first_played_at::text
       FROM music.user_tracks ut
       JOIN music.tracks t ON t.id = ut.track_id
       LEFT JOIN music.track_facets tf ON tf.track_id = t.id
       WHERE ut.user_id = $1 AND t.preview_url IS NOT NULL
         AND coalesce(ut.last_played_at, ut.added_at) < now() - interval '120 days'
         AND NOT EXISTS (SELECT 1 FROM music.daily_cards d
                         WHERE d.user_id = $1 AND d.track_id = t.id
                           AND d.local_date > current_date - 30)
       ORDER BY ut.play_count DESC, coalesce(ut.last_played_at, ut.added_at) ASC
       LIMIT 1`,
      [userId],
    );
    const track = rows.rows[0];
    if (!track) return null;
    const year = (track.first_played_at ?? '').slice(0, 4);
    return {
      track,
      kind: 'forgotten-favourite' as CardKind,
      reason: year
        ? reason('You loved this in {year} — remember?', { year })
        : reason('You loved this once and have not been back'),
    };
  }

  private async recentlyShown(userId: string): Promise<Set<string>> {
    const res = await this.pg.query<{ track_id: string }>(
      `SELECT track_id FROM music.daily_cards
       WHERE user_id = $1 AND local_date > current_date - 30`,
      [userId],
    );
    return new Set(res.rows.map((r) => r.track_id));
  }

  /** A corner of the library that barely exists — the smallest region present. */
  private async bridge(userId: string) {
    const rows = await this.pg.query<TrackRow>(
      `WITH rare AS (
         SELECT tf.region, count(*)::int AS n
         FROM music.user_tracks ut
         JOIN music.track_facets tf ON tf.track_id = ut.track_id
         WHERE ut.user_id = $1 AND tf.region <> 'unknown'
         GROUP BY tf.region ORDER BY n ASC LIMIT 1
       )
       SELECT ${SELECT_TRACK} ${UNHEARD}
         AND tf.region = (SELECT region FROM rare)
       ORDER BY random() LIMIT 1`,
      [userId],
    );
    const track = rows.rows[0];
    if (!track) return null;
    return {
      track,
      kind: 'bridge' as CardKind,
      reason: reason('A thin edge of your library: {region}', {
        region: track.region ?? 'unknown',
      }),
    };
  }

  /** Rare-bucket track by an artist otherwise known through their hits. */
  private async deepCut(userId: string) {
    const rows = await this.pg.query<TrackRow>(
      `SELECT ${SELECT_TRACK} ${UNHEARD}
         AND tf.rarity IN ('rare', 'niche')
       ORDER BY random() LIMIT 1`,
      [userId],
    );
    const track = rows.rows[0];
    if (!track) return null;
    const genre = track.genres?.[0];
    return {
      track,
      kind: 'deep-cut' as CardKind,
      reason: genre
        ? reason('Rare in your library: {genre}', { genre })
        : reason('From the quieter corner of your library'),
    };
  }

  private async loadTrack(trackId: string): Promise<TrackSummary> {
    const res = await this.pg.query<TrackRow>(
      `SELECT ${SELECT_TRACK}
       FROM music.tracks t
       LEFT JOIN music.track_facets tf ON tf.track_id = t.id
       WHERE t.id = $1`,
      [trackId],
    );
    if (!res.rows[0]) throw new NotFoundException();
    return toSummary(res.rows[0]);
  }
}

function toSummary(row: TrackRow): TrackSummary {
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

function reason(template: string, params: Record<string, string> = {}): CardReason {
  return { template, params };
}

function toBasis(row: TrackRow) {
  return { title: row.title, artist: row.artist_name };
}

function dominant(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value || value === 'unknown') continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? null;
}
