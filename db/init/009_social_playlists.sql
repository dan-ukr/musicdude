-- Playlists (created from a facet query), the social layer, and daily cards.
CREATE SCHEMA IF NOT EXISTS social;

CREATE TABLE IF NOT EXISTS music.playlists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  facet_query  jsonb NOT NULL DEFAULT '{}',
  includes_recommended boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS playlists_user_idx ON music.playlists (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS music.playlist_tracks (
  playlist_id uuid NOT NULL REFERENCES music.playlists(id) ON DELETE CASCADE,
  track_id    uuid NOT NULL REFERENCES music.tracks(id),
  position    int NOT NULL,
  recommended boolean NOT NULL DEFAULT false,
  PRIMARY KEY (playlist_id, track_id)
);

-- A short code the owner shares; anyone holding it can compare taste.
CREATE TABLE IF NOT EXISTS social.share_codes (
  code       text PRIMARY KEY,
  user_id    uuid NOT NULL UNIQUE REFERENCES core.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pairwise only, by design: no graph, no feed. Built on taste, never mood.
CREATE TABLE IF NOT EXISTS social.friends (
  user_id        uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  friend_user_id uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  match_pct      int,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_user_id)
);

-- One card per user per day, so the same track is not served twice.
CREATE TABLE IF NOT EXISTS music.daily_cards (
  user_id        uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  local_date     date NOT NULL,
  track_id       uuid NOT NULL REFERENCES music.tracks(id),
  reason_template text NOT NULL,
  reason_params  jsonb NOT NULL DEFAULT '{}',
  action         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, local_date)
);
