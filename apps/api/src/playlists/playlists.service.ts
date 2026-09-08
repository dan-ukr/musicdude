import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { CreatePlaylistRequest, PlaylistSummary, TrackSummary } from '@musicdude/shared';
import { EntitlementsService, FREE_PLAYLISTS_PER_MONTH } from '../billing/entitlements.service';
import { PgService } from '../database/pg.service';
import { LibraryService } from '../library/library.service';

@Injectable()
export class PlaylistsService {
  constructor(
    private readonly pg: PgService,
    private readonly library: LibraryService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async create(userId: string, dto: CreatePlaylistRequest): Promise<PlaylistSummary> {
    const premium = await this.entitlements.isPremium(userId);

    // The cap sits at the exit of the daily loop: every user meets it.
    if (!premium) {
      const used = await this.entitlements.playlistsUsedThisMonth(userId);
      if (used >= FREE_PLAYLISTS_PER_MONTH) {
        throw new ForbiddenException({
          error: 'premium_required',
          reason: 'playlist_quota',
          used,
          freeLimit: FREE_PLAYLISTS_PER_MONTH,
        });
      }
      if (dto.includeRecommended) {
        throw new ForbiddenException({ error: 'premium_required', reason: 'recommended_blend' });
      }
    }

    const ownIds = await this.library.trackIds(userId, dto.facets);
    const recommended = dto.includeRecommended
      ? await this.library.recommendedForQuery(userId, dto.facets, 15)
      : [];
    if (ownIds.length === 0 && recommended.length === 0) {
      throw new BadRequestException('No tracks match this filter');
    }

    const created = await this.pg.query<{ id: string; created_at: string }>(
      `INSERT INTO music.playlists (user_id, name, facet_query, includes_recommended)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [userId, dto.name.trim().slice(0, 120), JSON.stringify(dto.facets), Boolean(dto.includeRecommended)],
    );
    const playlistId = created.rows[0].id;

    let position = 0;
    for (const trackId of ownIds) {
      await this.pg.query(
        `INSERT INTO music.playlist_tracks (playlist_id, track_id, position, recommended)
         VALUES ($1, $2, $3, false) ON CONFLICT DO NOTHING`,
        [playlistId, trackId, position++],
      );
    }
    for (const track of recommended) {
      await this.pg.query(
        `INSERT INTO music.playlist_tracks (playlist_id, track_id, position, recommended)
         VALUES ($1, $2, $3, true) ON CONFLICT DO NOTHING`,
        [playlistId, track.id, position++],
      );
    }

    return {
      id: playlistId,
      name: dto.name.trim(),
      trackCount: ownIds.length + recommended.length,
      recommendedCount: recommended.length,
      includesRecommended: Boolean(dto.includeRecommended),
      createdAt: created.rows[0].created_at,
    };
  }

  async list(userId: string): Promise<PlaylistSummary[]> {
    const res = await this.pg.query<{
      id: string;
      name: string;
      includes_recommended: boolean;
      created_at: string;
      track_count: number;
      recommended_count: number;
    }>(
      `SELECT p.id, p.name, p.includes_recommended, p.created_at,
              count(pt.track_id)::int AS track_count,
              coalesce(sum(pt.recommended::int), 0)::int AS recommended_count
       FROM music.playlists p
       LEFT JOIN music.playlist_tracks pt ON pt.playlist_id = p.id
       WHERE p.user_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [userId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      trackCount: r.track_count,
      recommendedCount: r.recommended_count,
      includesRecommended: r.includes_recommended,
      createdAt: r.created_at,
    }));
  }

  async tracks(userId: string, playlistId: string): Promise<TrackSummary[]> {
    const res = await this.pg.query<{
      id: string;
      title: string;
      artist_name: string;
      preview_url: string | null;
      artwork_url: string | null;
      release_year: number | null;
      recommended: boolean;
    }>(
      `SELECT t.id, t.title, t.artist_name, t.preview_url, t.artwork_url, t.release_year, pt.recommended
       FROM music.playlists p
       JOIN music.playlist_tracks pt ON pt.playlist_id = p.id
       JOIN music.tracks t ON t.id = pt.track_id
       WHERE p.id = $1 AND p.user_id = $2
       ORDER BY pt.position`,
      [playlistId, userId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist_name,
      previewUrl: r.preview_url,
      artworkUrl: r.artwork_url,
      releaseYear: r.release_year,
      facets: null,
    }));
  }
}
