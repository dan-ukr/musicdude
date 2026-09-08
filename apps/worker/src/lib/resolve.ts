import { sleep } from '../db';

export type Resolved = {
  /** Stored for playback: stable, so it still works days later. */
  previewUrl: string | null;
  /**
   * Used for this scan's analysis only. Deezer serves mp3, which decodes with
   * libsndfile alone; iTunes serves m4a, which needs ffmpeg. Preferring the
   * mp3 here keeps analysis working wherever the worker runs.
   */
  analysisUrl: string | null;
  artworkUrl: string | null;
  releaseYear: number | null;
  deezerId: number | null;
  itunesId: number | null;
  deezerRank: number | null;
  deezerBpm: number | null;
};

const EMPTY: Resolved = {
  previewUrl: null,
  analysisUrl: null,
  artworkUrl: null,
  releaseYear: null,
  deezerId: null,
  itunesId: null,
  deezerRank: null,
  deezerBpm: null,
};

/**
 * Both sources are consulted, and iTunes wins for the preview URL.
 *
 * Deezer's preview links are signed and expire after a few hours: a stored one
 * stops playing in the app and stops downloading for analysis, which silently
 * turns real measurements into placeholders. iTunes serves stable URLs, so it
 * owns `previewUrl`; Deezer still provides popularity (the rarity facet), bpm
 * and artwork, none of which expire.
 */
export async function resolveTrack(title: string, artist: string): Promise<Resolved> {
  const viaDeezer = await resolveDeezer(title, artist);
  const viaItunes = await resolveItunes(title, artist);

  return {
    ...viaDeezer,
    ...stripNulls(viaItunes),
    previewUrl: viaItunes.previewUrl ?? viaDeezer.previewUrl,
    analysisUrl: viaDeezer.previewUrl ?? viaItunes.previewUrl,
    artworkUrl: viaDeezer.artworkUrl ?? viaItunes.artworkUrl,
  };
}

function stripNulls(r: Resolved): Partial<Resolved> {
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)) as Partial<Resolved>;
}

async function resolveDeezer(title: string, artist: string): Promise<Resolved> {
  try {
    const q = `artist:"${artist}" track:"${title}"`;
    let res = await fetch(`https://api.deezer.com/search?limit=1&q=${encodeURIComponent(q)}`);
    let data = (await res.json()) as { data?: { id: number; preview?: string; rank?: number }[] };
    if (!data.data?.length) {
      await sleep(120);
      res = await fetch(
        `https://api.deezer.com/search?limit=1&q=${encodeURIComponent(`${artist} ${title}`)}`,
      );
      data = (await res.json()) as typeof data;
    }
    const hit = data.data?.[0];
    if (!hit) return EMPTY;

    await sleep(120);
    const trackRes = await fetch(`https://api.deezer.com/track/${hit.id}`);
    const track = (await trackRes.json()) as {
      release_date?: string;
      bpm?: number;
      rank?: number;
      preview?: string;
      album?: { cover_big?: string; cover_medium?: string };
    };
    return {
      previewUrl: hit.preview || track.preview || null,
      analysisUrl: hit.preview || track.preview || null,
      artworkUrl: track.album?.cover_big ?? track.album?.cover_medium ?? null,
      releaseYear: track.release_date ? Number(track.release_date.slice(0, 4)) || null : null,
      deezerId: hit.id,
      itunesId: null,
      deezerRank: track.rank ?? hit.rank ?? null,
      deezerBpm: track.bpm && track.bpm > 40 ? track.bpm : null,
    };
  } catch {
    return EMPTY;
  }
}

async function resolveItunes(title: string, artist: string): Promise<Resolved> {
  try {
    const term = encodeURIComponent(`${artist} ${title}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=1`);
    const data = (await res.json()) as {
      results?: {
        trackId?: number;
        previewUrl?: string;
        releaseDate?: string;
        artworkUrl100?: string;
      }[];
    };
    const hit = data.results?.[0];
    if (!hit) return EMPTY;
    return {
      ...EMPTY,
      previewUrl: hit.previewUrl ?? null,
      analysisUrl: hit.previewUrl ?? null,
      // iTunes serves any size by substituting the dimensions in the path.
      artworkUrl: hit.artworkUrl100?.replace('100x100bb', '600x600bb') ?? null,
      releaseYear: hit.releaseDate ? Number(hit.releaseDate.slice(0, 4)) || null : null,
      itunesId: hit.trackId ?? null,
    };
  } catch {
    return EMPTY;
  }
}
