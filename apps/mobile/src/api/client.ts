import type {
  AuthResponse,
  ChangeSummary,
  Comparison,
  CreatePlaylistRequest,
  DailyCard,
  DailyCardAction,
  FriendSummary,
  ImportedTrack,
  LibraryFacets,
  LoginRequest,
  PlaylistSummary,
  PortraitResponse,
  RegisterRequest,
  ScanStatus,
  SearchResult,
  ShareCode,
  TasteEvent,
  TrackSummary,
} from '@musicdude/shared';
import { AUTH_TOKEN_KEY, storage } from '../utils/storage';

/**
 * In a browser the API is derived from the address the page was opened with,
 * so it follows localhost or a LAN IP automatically. A hard-coded LAN address
 * breaks silently every time the machine's IP changes: the app still renders
 * and every request quietly times out. Native builds have no page address, so
 * they use the configured value.
 */
const BASE_URL =
  typeof window !== 'undefined' && window.location?.hostname
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Server payload for premium gates: { error: 'premium_required', reason } */
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }

  get isPremiumRequired(): boolean {
    return this.detail?.error === 'premium_required';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await storage.getItem(AUTH_TOKEN_KEY);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string | Record<string, unknown>;
    };
    const detail = typeof body.message === 'object' ? (body.message as Record<string, unknown>) : undefined;
    const message = typeof body.message === 'string' ? body.message : res.statusText;
    throw new ApiError(res.status, message, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

const qs = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return entries.length ? `?${new URLSearchParams(entries as [string, string][])}` : '';
};

export const api = {
  // auth
  register: (body: RegisterRequest) => post<AuthResponse>('/auth/register', body),
  login: (body: LoginRequest) => post<AuthResponse>('/auth/login', body),
  profile: () => request<{ id: string; email: string; firstName: string | null }>('/user/profile'),

  // catalogue + import
  searchTracks: (q: string) => request<SearchResult[]>(`/catalog/search${qs({ q })}`),
  startImport: (source: string, tracks: ImportedTrack[]) =>
    post<ScanStatus>('/import', { source, tracks }),
  importDemo: () => post<ScanStatus>('/import/demo', {}),
  importSpotifyLink: (url: string) =>
    post<ScanStatus & { sourceName: string }>('/import/spotify-link', { url }),
  importFile: (content: string) => post<ScanStatus>('/import/file', { content }),
  scanStatus: () => request<ScanStatus | null>('/import/status'),

  // portrait + daily card
  portrait: () => request<PortraitResponse>('/portrait'),
  dailyCard: () => request<DailyCard>('/daily-card'),
  dailyCardAction: (action: DailyCardAction) => post<DailyCard>('/daily-card/action', { action }),

  // library + playlists
  libraryFacets: () => request<LibraryFacets>('/library/facets'),
  libraryTracks: (facets: Record<string, string | undefined>) =>
    request<TrackSummary[]>(`/library/tracks${qs(facets)}`),
  recommended: (facets: Record<string, string | undefined>) =>
    request<TrackSummary[]>(`/library/recommended${qs(facets)}`),
  createPlaylist: (body: CreatePlaylistRequest) => post<PlaylistSummary>('/playlists', body),
  playlists: () => request<PlaylistSummary[]>('/playlists'),
  playlistTracks: (id: string) => request<TrackSummary[]>(`/playlists/${id}/tracks`),

  // social
  shareCode: () => request<ShareCode>('/social/code'),
  compare: (code: string) => request<Comparison>(`/social/compare/${encodeURIComponent(code)}`),
  addFriend: (code: string) => post<FriendSummary>('/social/friends', { code }),
  friends: () => request<FriendSummary[]>('/social/friends'),

  // events + change + billing
  events: (city?: string) => request<TasteEvent[]>(`/events${qs({ city })}`),
  change: () => request<ChangeSummary>('/change'),
  billingStatus: () =>
    request<{
      premium: boolean;
      playlists: { used: number; limit: number | null };
      devToggleEnabled: boolean;
    }>('/billing/status'),
  setDevPremium: (active: boolean) => post<{ premium: boolean }>('/billing/dev-premium', { active }),
};
