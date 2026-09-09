import { detectAll } from 'tinyld';
import { MUSIC_LANGUAGE_SET } from '@musicdude/shared';
import { sleep } from '../db';

const LRCLIB = 'https://lrclib.net/api';
const USER_AGENT = 'MusicDude/0.1.0 (contact@musicdude.app)';
// Sparse, repetitive vocals (a few sampled words) are easy to misread: Aphex
// Twin's Windowlicker came back as Finnish at a lower bar. Requiring more text
// and more confidence turns those into an honest gap for the next tier.
const MIN_LYRIC_CHARS = 80;
const MIN_CONFIDENCE = 0.5;

/**
 * Language of the *recording*, read from its lyrics.
 *
 * The artist's nationality is the wrong signal: ABBA is Swedish and sings in
 * English, Rammstein's country and language agree only by luck, and a Ukrainian
 * artist may release in English. LRCLIB is an open, keyless lyrics database
 * that also marks purely instrumental recordings, which gives us both the text
 * to detect and an honest answer for tracks that have no words at all.
 */
export type LyricsLanguage =
  | { kind: 'instrumental' }
  | { kind: 'language'; code: string }
  | null;

type LrclibHit = {
  trackName?: string;
  artistName?: string;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

export async function languageFromLyrics(
  title: string,
  artist: string,
): Promise<LyricsLanguage> {
  let hit = await lookup(title, artist);
  // Retry once without remaster/feature/version noise, which is the usual
  // reason a well-known song fails to match.
  const simplified = simplifyTitle(title);
  if (!hit && simplified !== title) hit = await lookup(simplified, artist);
  if (!hit) return null;
  if (hit.instrumental) return { kind: 'instrumental' };

  const text = cleanLyrics(hit.plainLyrics ?? '');
  if (text.length < MIN_LYRIC_CHARS) {
    // Present but empty lyrics is how some entries record an instrumental.
    return hit.plainLyrics === '' ? { kind: 'instrumental' } : null;
  }

  // Wordless vocalise reads as a language to a statistical detector: Aphex
  // Twin's "Mmmmmm… Uuuuuu… Aiuh" came back as Finnish at 0.87 confidence.
  // A recording whose text is only humming has no language, it is instrumental.
  if (!hasRealWords(text)) return { kind: 'instrumental' };

  const [best] = detectAll(text);
  if (!best || best.accuracy < MIN_CONFIDENCE) return null;
  if (!MUSIC_LANGUAGE_SET.has(best.lang)) return null;
  return { kind: 'language', code: best.lang };
}

async function lookup(title: string, artist: string): Promise<LrclibHit | null> {
  const url = `${LRCLIB}/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const rows = (await res.json()) as LrclibHit[];
    if (!Array.isArray(rows) || rows.length === 0) return null;

    // Prefer an entry that actually carries words; several versions of the same
    // recording are common and only some have lyrics attached.
    const withLyrics = rows.find((r) => (r.plainLyrics ?? '').trim().length >= MIN_LYRIC_CHARS);
    return withLyrics ?? rows[0];
  } catch {
    return null;
  } finally {
    await sleep(120); // stay a polite client of a free service
  }
}

/**
 * Vocables ("mmmm", "uuuu", "ooh", "laaa laalaa") are sung sound, not language.
 * Collapsing repeated letters and counting the distinct ones catches syllable
 * runs as well as hums: "laalaalaaaa" reduces to two letters, "croquettes"
 * does not.
 */
function isVocable(token: string): boolean {
  if (/^[aeiouyhmn']+$/u.test(token)) return true;
  const collapsed = token.replace(/(.)\1+/gu, '$1');
  return new Set(collapsed).size <= 2;
}

function hasRealWords(text: string): boolean {
  const tokens = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (tokens.length === 0) return false;
  const words = tokens.filter((t) => t.length > 1 && !isVocable(t));
  return words.length >= 8 && words.length / tokens.length >= 0.35;
}

function simplifyTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s*-\s*(remaster(ed)?|live|radio edit|single version|mono|stereo).*$/i, '')
    .replace(/\s*(feat\.?|ft\.?|with)\s+.*$/i, '')
    .trim();
}

/** Strips timestamps, section markers and repeated ad-libs before detection. */
function cleanLyrics(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}
