import { BadRequestException, Injectable } from '@nestjs/common';
import type { ImportedTrack, ImportSource, ScanStatus } from '@musicdude/shared';
import { PgService } from '../database/pg.service';
import { QueueService } from '../queue/queue.service';

const MAX_TRACKS_PER_IMPORT = 5000;

@Injectable()
export class ImportsService {
  constructor(
    private readonly pg: PgService,
    private readonly queues: QueueService,
  ) {}

  async startImport(userId: string, source: ImportSource, tracks: ImportedTrack[]): Promise<ScanStatus> {
    const cleaned = tracks
      .map((t) => ({ ...t, title: t.title.trim(), artist: t.artist.trim() }))
      .filter((t) => t.title && t.artist)
      .slice(0, MAX_TRACKS_PER_IMPORT);
    if (cleaned.length === 0) throw new BadRequestException('No valid tracks');

    const trackIds: string[] = [];
    for (const t of cleaned) {
      const res = await this.pg.query<{ id: string }>(
        `INSERT INTO music.tracks (title, artist_name)
         VALUES ($1, $2)
         ON CONFLICT (title, artist_name) DO UPDATE SET title = EXCLUDED.title
         RETURNING id`,
        [t.title, t.artist],
      );
      const trackId = res.rows[0].id;
      trackIds.push(trackId);

      await this.pg.query(
        `INSERT INTO music.user_tracks (user_id, track_id, source, play_count, first_played_at, last_played_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (user_id, track_id) DO UPDATE SET
           play_count = GREATEST(music.user_tracks.play_count, EXCLUDED.play_count),
           last_played_at = COALESCE(EXCLUDED.last_played_at, music.user_tracks.last_played_at)`,
        [userId, trackId, source, t.playCount ?? 0, t.playedAt ?? null],
      );

      if (t.playedAt) {
        await this.pg.query(
          `INSERT INTO music.plays (user_id, track_id, played_at, source) VALUES ($1, $2, $3, 'import')`,
          [userId, trackId, t.playedAt],
        );
      }
    }

    await this.pg.query(
      `INSERT INTO music.scan_jobs (user_id, state, total, processed, updated_at)
       VALUES ($1, 'running', $2, 0, now())
       ON CONFLICT (user_id) DO UPDATE SET state = 'running',
         total = $2, processed = 0, updated_at = now()`,
      [userId, trackIds.length],
    );

    // Priority ordering happens in the worker: most-played first, so the
    // portrait is representative early.
    await this.queues.scan.add('scan', { userId, trackIds });

    return { state: 'running', total: trackIds.length, processed: 0 };
  }

  async status(userId: string): Promise<ScanStatus | null> {
    const res = await this.pg.query<{ state: string; total: number; processed: number }>(
      `SELECT state, total, processed FROM music.scan_jobs WHERE user_id = $1`,
      [userId],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return { state: row.state as ScanStatus['state'], total: row.total, processed: row.processed };
  }
}
