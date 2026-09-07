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
export type ImportSource = 'search' | 'playlist-link' | 'gdpr-export' | 'demo';

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
  trackCount: number;
  generatedAt: string;
};

// ---------- Daily card ----------
export type DailyCard = {
  track: TrackSummary;
  reason: string; // one bridge sentence — always free
  date: string;
};
export type DailyCardAction = 'more-of-this' | 'get-me-out';

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
