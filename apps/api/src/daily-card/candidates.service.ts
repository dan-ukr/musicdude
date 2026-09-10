import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../database/pg.service';

const DEEZER = 'https://api.deezer.com';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type DeezerArtist = { id: number; name: string };
type DeezerTrack = {
  id: number;
  title: string;
  rank?: number;
  preview?: string;
  artist?: { name: string };
  album?: { cover_big?: string; cover_medium?: string };
};

export type Candidate = {
  trackId: string;
  title: string;
  artist: string;
  previewUrl: string | null;
  artworkUrl: string | null;
  seedArtist: string;
};

/**
 * Where recommendations come from.
 *
 * The pool cannot be whatever happens to be sitting in our tables — that is
 * only what previous users imported, a few hundred rows, and recommending from
 * it would just shuffle other people's libraries. Candidates are browsed live
 * from the catalogue instead: Deezer's related-artist graph, seeded by artists
 * the person actually plays, then that artist's top tracks. Keyless, and the
 * response already carries a preview and cover art.
 *
 * Anything returned is cached into music.tracks so the scan pipeline can
 * analyse it later; the table is a cache of what we browsed, never the pool.
 */
@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);
  private cache = new Map<string, { at: number; candidates: Candidate[] }>();

  constructor(private readonly pg: PgService) {}

  async browse(userId: string, seedArtists: string[], limit = 40): Promise<Candidate[]> {
    if (seedArtists.length === 0) return [];
    const key = `${userId}:${seedArtists.slice(0, 3).join('|')}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.candidates;

    const owned = await this.ownedKeys(userId);
    const found: Candidate[] = [];

    for (const seed of seedArtists.slice(0, 3)) {
      try {
        const artist = await this.findArtist(seed);
        if (!artist) continue;
        const related = await this.json<{ data?: DeezerArtist[] }>(
          `${DEEZER}/artist/${artist.id}/related?limit=6`,
        );
        for (const neighbour of related?.data ?? []) {
          const top = await this.json<{ data?: DeezerTrack[] }>(
            `${DEEZER}/artist/${neighbour.id}/top?limit=5`,
          );
          for (const track of top?.data ?? []) {
            const artistName = track.artist?.name ?? neighbour.name;
            if (!track.title || !track.preview) continue;
            if (owned.has(`${artistName}::${track.title}`.toLowerCase())) continue;

            const trackId = await this.cacheTrack(track, artistName);
            if (!trackId) continue;
            found.push({
              trackId,
              title: track.title,
              artist: artistName,
              previewUrl: track.preview ?? null,
              artworkUrl: track.album?.cover_big ?? track.album?.cover_medium ?? null,
              seedArtist: seed,
            });
            if (found.length >= limit) break;
          }
          if (found.length >= limit) break;
        }
      } catch (err) {
        this.logger.warn(`browse failed for ${seed}: ${(err as Error).message}`);
      }
      if (found.length >= limit) break;
    }

    this.cache.set(key, { at: Date.now(), candidates: found });
    return found;
  }

  private async findArtist(name: string): Promise<DeezerArtist | null> {
    const res = await this.json<{ data?: DeezerArtist[] }>(
      `${DEEZER}/search/artist?limit=1&q=${encodeURIComponent(name)}`,
    );
    return res?.data?.[0] ?? null;
  }

  /** Remembers a browsed track so the scan pipeline can analyse it later. */
  private async cacheTrack(track: DeezerTrack, artistName: string): Promise<string | null> {
    const res = await this.pg.query<{ id: string }>(
      `INSERT INTO music.tracks (title, artist_name, preview_url, artwork_url, deezer_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (title, artist_name) DO UPDATE SET
         preview_url = COALESCE(EXCLUDED.preview_url, music.tracks.preview_url),
         artwork_url = COALESCE(EXCLUDED.artwork_url, music.tracks.artwork_url)
       RETURNING id`,
      [
        track.title,
        artistName,
        track.preview ?? null,
        track.album?.cover_big ?? track.album?.cover_medium ?? null,
        track.id,
      ],
    );
    return res.rows[0]?.id ?? null;
  }

  private async ownedKeys(userId: string): Promise<Set<string>> {
    const res = await this.pg.query<{ key: string }>(
      `SELECT lower(t.artist_name || '::' || t.title) AS key
       FROM music.user_tracks ut JOIN music.tracks t ON t.id = ut.track_id
       WHERE ut.user_id = $1`,
      [userId],
    );
    return new Set(res.rows.map((r) => r.key));
  }

  private async json<T>(url: string): Promise<T | null> {
    const res = await fetch(url, { headers: { 'User-Agent': 'MusicDude/0.1' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  }
}
