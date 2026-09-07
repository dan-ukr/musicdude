import { sleep } from '../db';

export type Resolved = {
  previewUrl: string | null;
  releaseYear: number | null;
  deezerId: number | null;
  itunesId: number | null;
  deezerRank: number | null;
  deezerBpm: number | null;
};

const EMPTY: Resolved = {
  previewUrl: null,
  releaseYear: null,
  deezerId: null,
  itunesId: null,
  deezerRank: null,
  deezerBpm: null,
};

/** Deezer primary (~10 req/s allowed; we stay well under), iTunes fallback (~20/min). */
export async function resolveTrack(title: string, artist: string): Promise<Resolved> {
  const viaDeezer = await resolveDeezer(title, artist);
  if (viaDeezer.previewUrl) return viaDeezer;
  const viaItunes = await resolveItunes(title, artist);
  // keep deezer metadata even when its preview was missing
  return { ...viaDeezer, ...stripNulls(viaItunes) };
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
    };
    return {
      previewUrl: hit.preview || track.preview || null,
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
      results?: { trackId?: number; previewUrl?: string; releaseDate?: string }[];
    };
    const hit = data.results?.[0];
    if (!hit) return EMPTY;
    return {
      ...EMPTY,
      previewUrl: hit.previewUrl ?? null,
      releaseYear: hit.releaseDate ? Number(hit.releaseDate.slice(0, 4)) || null : null,
      itunesId: hit.trackId ?? null,
    };
  } catch {
    return EMPTY;
  }
}
