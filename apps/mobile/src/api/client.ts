import type {
  AuthResponse,
  ImportedTrack,
  LoginRequest,
  PortraitResponse,
  RegisterRequest,
  ScanStatus,
  SearchResult,
} from '@musicdude/shared';
import { AUTH_TOKEN_KEY, storage } from '../utils/storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

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
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const api = {
  register: (body: RegisterRequest) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: LoginRequest) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  profile: () => request<{ id: string; email: string; firstName: string | null }>('/user/profile'),
  searchTracks: (q: string) =>
    request<SearchResult[]>(`/catalog/search?q=${encodeURIComponent(q)}`),
  startImport: (source: string, tracks: ImportedTrack[]) =>
    request<ScanStatus>('/import', { method: 'POST', body: JSON.stringify({ source, tracks }) }),
  importDemo: () => request<ScanStatus>('/import/demo', { method: 'POST', body: '{}' }),
  portrait: () => request<PortraitResponse>('/portrait'),
};
