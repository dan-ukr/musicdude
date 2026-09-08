import type { ImportedTrack } from '@musicdude/shared';

const MAX_TRACKS = 5000;

/**
 * Spotify public playlist / album / track link, read through the keyless embed
 * page. No developer credentials, no user login — the embed ships the track
 * list in its __NEXT_DATA__ payload, which is why this works in a browser
 * session where the WebView connector cannot run.
 */
export async function fetchSpotifyLink(rawUrl: string): Promise<{ name: string; tracks: ImportedTrack[] }> {
  const parsed = parseSpotifyUrl(rawUrl);
  if (!parsed) throw new Error('Not a Spotify playlist, album or track link');

  const res = await fetch(`https://open.spotify.com/embed/${parsed.kind}/${parsed.id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MusicDude/0.1)' },
  });
  if (!res.ok) throw new Error(`Spotify returned ${res.status}`);
  const html = await res.text();

  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not read that link (is it public?)');

  const data = JSON.parse(match[1]) as {
    props?: { pageProps?: { state?: { data?: { entity?: SpotifyEntity } } } };
  };
  const entity = data.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error('Could not read that link (is it public?)');

  const list = entity.trackList ?? [];
  const tracks: ImportedTrack[] = list
    .map((item) => ({
      title: (item.title ?? '').trim(),
      // The embed puts the artist in `subtitle`.
      artist: (item.subtitle ?? '').split(',')[0].trim(),
    }))
    .filter((t) => t.title && t.artist);

  return { name: entity.name ?? 'Spotify import', tracks: tracks.slice(0, MAX_TRACKS) };
}

type SpotifyEntity = {
  name?: string;
  trackList?: { title?: string; subtitle?: string }[];
};

function parseSpotifyUrl(raw: string): { kind: string; id: string } | null {
  const cleaned = raw.trim();
  const match = cleaned.match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?|spotify:)(playlist|album|track)[/:]([A-Za-z0-9]+)/);
  if (!match) return null;
  return { kind: match[1], id: match[2] };
}

/**
 * A pasted or uploaded file. Handles, by shape:
 *  - Spotify data export JSON (StreamingHistory / YourLibrary), which carries
 *    real timestamps — the strongest import we can get without any API.
 *  - Apple Music / iTunes "Library.xml" plist export.
 *  - Plain text, one "Artist - Title" per line.
 */
export function parseImportFile(content: string): ImportedTrack[] {
  const text = content.trim();
  if (!text) return [];

  if (text.startsWith('{') || text.startsWith('[')) return parseJsonExport(text);
  if (text.includes('<plist') || text.includes('<!DOCTYPE plist')) return parseItunesXml(text);
  return parseTextList(text);
}

function parseJsonExport(text: string): ImportedTrack[] {
  const data = JSON.parse(text) as unknown;

  // StreamingHistory*.json: [{ endTime, artistName, trackName, msPlayed }]
  if (Array.isArray(data)) {
    const rows = data as Record<string, unknown>[];
    const out = new Map<string, ImportedTrack>();
    for (const row of rows) {
      const title = str(row.trackName ?? row.master_metadata_track_name ?? row.title);
      const artist = str(
        row.artistName ?? row.master_metadata_album_artist_name ?? row.artist,
      );
      if (!title || !artist) continue;
      const playedAt = str(row.endTime ?? row.ts ?? row.added_at) || undefined;
      const key = `${artist}::${title}`.toLowerCase();
      const existing = out.get(key);
      if (existing) {
        existing.playCount = (existing.playCount ?? 1) + 1;
        if (playedAt && (!existing.playedAt || playedAt > existing.playedAt)) {
          existing.playedAt = playedAt;
        }
      } else {
        out.set(key, { title, artist, playCount: 1, playedAt: toIso(playedAt) });
      }
    }
    return [...out.values()].slice(0, MAX_TRACKS);
  }

  // YourLibrary.json: { tracks: [{ artist, album, track, uri }] }
  const obj = data as { tracks?: Record<string, unknown>[] };
  if (Array.isArray(obj.tracks)) {
    return obj.tracks
      .map((row) => ({
        title: str(row.track ?? row.trackName ?? row.title),
        artist: str(row.artist ?? row.artistName),
      }))
      .filter((t) => t.title && t.artist)
      .slice(0, MAX_TRACKS);
  }
  throw new Error('Unrecognized JSON export');
}

/** iTunes/Apple Music plist: <key>Name</key><string>…</string> pairs per track. */
function parseItunesXml(text: string): ImportedTrack[] {
  const out: ImportedTrack[] = [];
  const dictBlocks = text.split('<dict>');
  for (const block of dictBlocks) {
    const title = xmlValue(block, 'Name');
    const artist = xmlValue(block, 'Artist');
    if (!title || !artist) continue;
    const playCount = Number(xmlIntValue(block, 'Play Count') ?? 0) || undefined;
    const playedAt = xmlValue(block, 'Play Date UTC') ?? undefined;
    out.push({ title, artist, playCount, playedAt: toIso(playedAt) });
    if (out.length >= MAX_TRACKS) break;
  }
  return out;
}

function xmlValue(block: string, key: string): string | null {
  const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`);
  const m = block.match(re);
  return m ? decodeXml(m[1]).trim() : null;
}

function xmlIntValue(block: string, key: string): string | null {
  const re = new RegExp(`<key>${key}</key>\\s*<integer>(\\d+)</integer>`);
  const m = block.match(re);
  return m ? m[1] : null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** "Artist - Title", "Artist – Title" (en dash), or "Title by Artist". */
function parseTextList(text: string): ImportedTrack[] {
  const out: ImportedTrack[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    let artist = '';
    let title = '';
    const dash = trimmed.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    const by = trimmed.match(/^(.+?)\s+by\s+(.+)$/i);
    const comma = trimmed.match(/^([^,]+),\s*(.+)$/);
    if (dash) {
      artist = dash[1];
      title = dash[2];
    } else if (by) {
      title = by[1];
      artist = by[2];
    } else if (comma) {
      artist = comma[1];
      title = comma[2];
    } else {
      continue;
    }
    out.push({ title: title.trim(), artist: artist.trim() });
    if (out.length >= MAX_TRACKS) break;
  }
  return out;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toIso(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
