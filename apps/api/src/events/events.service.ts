import { Injectable, Logger } from '@nestjs/common';
import type { TasteEvent } from '@musicdude/shared';
import { PgService } from '../database/pg.service';

const MB_BASE = process.env.MUSICBRAINZ_BASE_URL ?? 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'MusicDude/0.1.0 (contact@musicdude.app)';
const CACHE_TTL_MS = 30 * 60 * 1000;

type MbRelation = {
  type?: string;
  artist?: { id: string; name: string };
  place?: { name?: string; area?: { name?: string } };
};
type MbEvent = {
  id: string;
  name: string;
  type?: string;
  'life-span'?: { begin?: string };
  relations?: MbRelation[];
};

/**
 * Taste-matched events from MusicBrainz's event entity — open data, no API key,
 * strongest coverage in Europe which is where the first market is. Ticketmaster
 * and Bandsintown both require keys, so they slot in later as extra sources
 * behind the same response shape.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private cache = new Map<string, { at: number; events: TasteEvent[] }>();

  constructor(private readonly pg: PgService) {}

  async forUser(userId: string, city?: string): Promise<TasteEvent[]> {
    const artists = await this.topArtists(userId);
    if (artists.length === 0) return [];

    const key = `${userId}:${city ?? ''}:${artists.length}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.events;

    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

    // One request covers many artists; a city narrows it to what is nearby.
    const artistClause = artists
      .slice(0, 25)
      .map((a) => `artist:"${a.replace(/["\\]/g, ' ')}"`)
      .join(' OR ');
    const query = city
      ? `place:"${city.replace(/["\\]/g, ' ')}" AND begin:[${today} TO ${horizon}]`
      : `(${artistClause}) AND begin:[${today} TO ${horizon}]`;

    const url = `${MB_BASE}/event?query=${encodeURIComponent(query)}&fmt=json&limit=60&inc=artist-rels+place-rels`;
    let events: TasteEvent[] = [];
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) {
        this.logger.warn(`musicbrainz events HTTP ${res.status}`);
        return [];
      }
      const data = (await res.json()) as { events?: MbEvent[] };
      const owned = new Set(artists.map((a) => a.toLowerCase()));
      events = (data.events ?? [])
        .map((e) => toTasteEvent(e, owned, city))
        .filter((e): e is TasteEvent => e !== null)
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      this.logger.warn(`musicbrainz events failed: ${(err as Error).message}`);
      return [];
    }

    this.cache.set(key, { at: Date.now(), events });
    return events;
  }

  private async topArtists(userId: string): Promise<string[]> {
    const res = await this.pg.query<{ artist_name: string }>(
      `SELECT t.artist_name
       FROM music.user_tracks ut
       JOIN music.tracks t ON t.id = ut.track_id
       WHERE ut.user_id = $1
       GROUP BY t.artist_name
       ORDER BY sum(ut.play_count) DESC, count(*) DESC
       LIMIT 25`,
      [userId],
    );
    return res.rows.map((r) => r.artist_name);
  }
}

function toTasteEvent(
  event: MbEvent,
  ownedArtists: Set<string>,
  city?: string,
): TasteEvent | null {
  const date = event['life-span']?.begin;
  if (!date) return null;

  const artistRel = (event.relations ?? []).find((r) => r.artist);
  const placeRel = (event.relations ?? []).find((r) => r.place);
  const artistName = artistRel?.artist?.name ?? null;
  const matched = artistName && ownedArtists.has(artistName.toLowerCase()) ? artistName : null;

  // In city mode, keep everything and mark the taste matches; in artist mode
  // every result is a match by construction.
  const reason: Pick<TasteEvent, 'reasonTemplate' | 'reasonParams'> = matched
    ? { reasonTemplate: 'You listen to {artist}', reasonParams: { artist: matched } }
    : { reasonTemplate: 'Near you, in your taste range', reasonParams: {} };

  return {
    id: event.id,
    name: event.name,
    date,
    venue: placeRel?.place?.name ?? null,
    city: placeRel?.place?.area?.name ?? city ?? null,
    matchedArtist: matched,
    ...reason,
  };
}
