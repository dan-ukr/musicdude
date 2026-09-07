import { Injectable, Logger } from '@nestjs/common';
import type { SearchResult } from '@musicdude/shared';

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; release_date?: string };
};

/**
 * Client Credentials flow — search/metadata only, no user data (ecouter pattern).
 * Disabled cleanly when SPOTIFY_CLIENT_ID/SECRET are absent.
 */
@Injectable()
export class SpotifyService {
  private readonly logger = new Logger(SpotifyService.name);
  private token: { value: string; expiresAt: number } | null = null;

  get enabled(): boolean {
    return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  }

  private async getToken(): Promise<string | null> {
    if (!this.enabled) return null;
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;

    const basic = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
    ).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      this.logger.warn(`spotify token request failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return this.token.value;
  }

  async search(q: string, limit = 10): Promise<SearchResult[] | null> {
    const token = await this.getToken();
    if (!token) return null;

    const url = `https://api.spotify.com/v1/search?type=track&limit=${limit}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      this.logger.warn(`spotify search failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { tracks: { items: SpotifyTrack[] } };
    return data.tracks.items.map((t) => ({
      title: t.name,
      artist: t.artists[0]?.name ?? '',
      album: t.album?.name ?? null,
      year: t.album?.release_date ? Number(t.album.release_date.slice(0, 4)) || null : null,
      spotifyId: t.id,
      deezerId: null,
    }));
  }
}
