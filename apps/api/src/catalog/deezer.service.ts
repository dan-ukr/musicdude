import { Injectable, Logger } from '@nestjs/common';
import type { SearchResult } from '@musicdude/shared';

type DeezerTrack = {
  id: number;
  title: string;
  artist: { name: string };
  album: { title: string };
};

/** Open API, no key. Fallback search when Spotify credentials are absent. */
@Injectable()
export class DeezerService {
  private readonly logger = new Logger(DeezerService.name);

  async search(q: string, limit = 10): Promise<SearchResult[]> {
    try {
      const res = await fetch(
        `https://api.deezer.com/search?limit=${limit}&q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: DeezerTrack[] };
      return (data.data ?? []).map((t) => ({
        title: t.title,
        artist: t.artist?.name ?? '',
        album: t.album?.title ?? null,
        year: null, // deezer search results carry no release date; the scan resolves it later
        spotifyId: null,
        deezerId: t.id,
      }));
    } catch (err) {
      this.logger.warn(`deezer search failed: ${(err as Error).message}`);
      return [];
    }
  }
}
