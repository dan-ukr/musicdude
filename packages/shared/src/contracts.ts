import type { FacetQuery, TrackFacets } from './facets';

// ---------- Auth ----------
export type RegisterRequest = {
  email: string;
  password: string;
  firstName?: string;
  language?: string;
};
export type LoginRequest = { email: string; password: string };
export type AuthResponse = { accessToken: string };

// ---------- Library / import ----------
export type ImportSource = 'search' | 'playlist-link' | 'gdpr-export' | 'demo' | 'spotify-liked';

export type ImportedTrack = {
  title: string;
  artist: string;
  album?: string;
  playedAt?: string; // ISO timestamp when available (GDPR export) — first-class signal
  playCount?: number;
};

export type StartScanRequest = { source: ImportSource; tracks: ImportedTrack[] };
export type ScanStatus = {
  state: 'idle' | 'running' | 'done' | 'failed';
  total: number;
  processed: number;
};

// ---------- Catalog search (Spotify client-credentials primary, Deezer fallback) ----------
export type SearchResult = {
  title: string;
  artist: string;
  album: string | null;
  year: number | null;
  spotifyId: string | null;
  deezerId: number | null;
};

// ---------- Tracks ----------
export type TrackSummary = {
  id: string;
  title: string;
  artist: string;
  previewUrl: string | null;
  artworkUrl: string | null;
  releaseYear: number | null;
  facets: Omit<TrackFacets, 'trackId'> | null;
};

export type LibraryFilterRequest = {
  facets: FacetQuery;
  limit?: number;
  offset?: number;
};

// ---------- Portrait ----------
export type PortraitPayload = {
  rarityPercentile: number | null;
  eraDistribution: Record<string, number>;
  regionDistribution: Record<string, number>;
  languageDistribution: Record<string, number>;
  moodDistribution: Record<string, number>;
  genreDistribution: Record<string, number>;
  trackCount: number;
  generatedAt: string;
};

// ---------- Daily card ----------
/**
 * The reason is a translatable template plus values, so the bridge sentence
 * reads naturally in all 11 languages instead of being English-only prose.
 */
export type CardReason = { template: string; params: Record<string, string> };

/** Why this track was chosen — the angle, not just the sentence. */
export type CardKind =
  | 'because-you-played'
  | 'forgotten-favourite'
  | 'deep-cut'
  | 'bridge'
  | 'follows-the-mood'
  | 'breaks-the-mood'
  | 'similar';

export type DailyCard = {
  track: TrackSummary;
  reason: CardReason; // one bridge sentence — always free
  kind: CardKind;
  date: string;
  action: DailyCardAction | null;
  /** The recent tracks this recommendation was actually derived from. */
  basedOn: { title: string; artist: string }[];
};
export type DailyCardAction = 'more-of-this' | 'get-me-out';

/** A catalogue track scored against the viewer's taste, 0-100. */
export type DiscoverTrack = TrackSummary & { compatibility: number };

// ---------- Library ----------
export type FacetOption = { value: string; count: number };
export type LibraryFacets = {
  language: FacetOption[];
  mood: FacetOption[];
  era: FacetOption[];
  region: FacetOption[];
  genre: FacetOption[];
  tempo: FacetOption[];
  energy: FacetOption[];
  rarity: FacetOption[];
};

// ---------- Playlists ----------
export type PlaylistSummary = {
  id: string;
  name: string;
  trackCount: number;
  recommendedCount: number;
  includesRecommended: boolean;
  createdAt: string;
};
export type CreatePlaylistRequest = {
  name: string;
  facets: FacetQuery;
  includeRecommended?: boolean;
};
export type PlaylistQuota = { used: number; limit: number | null };

// ---------- Social (taste only — mood is never shareable) ----------
export type ShareCode = { code: string };
export type BridgeTrack = { title: string; artist: string; previewUrl: string | null };
export type Comparison = {
  otherName: string;
  matchPct: number;
  bridgeTracks: BridgeTrack[];
  sharedFacets: { facet: string; value: string }[];
  isFriend: boolean;
};
export type FriendSummary = {
  userId: string;
  name: string;
  matchPct: number;
  since: string;
};

// ---------- Events ----------
export type TasteEvent = {
  id: string;
  name: string;
  date: string;
  venue: string | null;
  city: string | null;
  matchedArtist: string | null;
  reasonTemplate: string;
  reasonParams: Record<string, string>;
};

// ---------- Change ----------
export type ChangePoint = {
  month: string; // YYYY-MM
  trackCount: number;
  topGenre: string | null;
  topLanguage: string | null;
  topRegion: string | null;
};
export type ChangeSummary = {
  timeline: ChangePoint[];
  arrived: { value: string; facet: string; month: string }[];
  locked: boolean; // free tier sees the last 30 days only
};

// ---------- Portrait endpoint ----------
export type PortraitResponse = {
  scan: ScanStatus | null;
  portrait: PortraitPayload | null;
};

// ---------- ML service ----------
export type AnalyzeRequest = {
  track_id: string;
  preview_url: string;
  metadata?: Record<string, unknown>;
};
export type AnalyzeResponse = {
  tempo_bpm: number;
  energy: number; // 0..1
  valence: number; // 0..1
  key: number; // 0..11
  mode: 0 | 1;
  embedding: number[];
};

// ---------- Notifications: two separate channels, never merged ----------
export type NotificationChannel = 'song-of-day' | 'care';
export type ChannelPrefs = {
  songOfDayEnabled: boolean;
  careEnabled: boolean;
  learnedSendHour: number | null; // song-of-day only; care has no time of its own
};
