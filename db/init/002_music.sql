-- Music catalog + per-user library + plays (timestamps are a first-class signal) + facet index
CREATE SCHEMA IF NOT EXISTS music;

CREATE TABLE IF NOT EXISTS music.artists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  mbid       text UNIQUE,
  country    text,
  begin_year int,
  tags       jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS music.tracks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  artist_id    uuid REFERENCES music.artists(id),
  artist_name  text NOT NULL, -- denormalized: resolution to artists row may lag or fail (graceful degradation)
  mbid         text,
  itunes_id    bigint,
  deezer_id    bigint,
  preview_url  text,
  release_year int,
  duration_ms  int,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (title, artist_name)
);

-- Membership of a track in a user's library
CREATE TABLE IF NOT EXISTS music.user_tracks (
  user_id         uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  track_id        uuid NOT NULL REFERENCES music.tracks(id),
  source          text NOT NULL, -- search | playlist-link | gdpr-export | demo
  play_count      int NOT NULL DEFAULT 0,
  first_played_at timestamptz,
  last_played_at  timestamptz,
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE TABLE IF NOT EXISTS music.plays (
  id        bigserial PRIMARY KEY,
  user_id   uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  track_id  uuid NOT NULL REFERENCES music.tracks(id),
  played_at timestamptz NOT NULL,
  source    text NOT NULL DEFAULT 'import'
);
CREATE INDEX IF NOT EXISTS plays_user_time_idx ON music.plays (user_id, played_at DESC);

-- Facet index: flat, queryable, honest `unknown` — never guessed
CREATE TABLE IF NOT EXISTS music.track_facets (
  track_id   uuid PRIMARY KEY REFERENCES music.tracks(id) ON DELETE CASCADE,
  language   text NOT NULL DEFAULT 'unknown',
  mood       text NOT NULL DEFAULT 'unknown',
  era        text NOT NULL DEFAULT 'unknown',
  region     text NOT NULL DEFAULT 'unknown',
  tempo      text NOT NULL DEFAULT 'unknown',
  energy     text NOT NULL DEFAULT 'unknown',
  rarity     text NOT NULL DEFAULT 'unknown',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Raw audio features from 30s preview analysis
CREATE TABLE IF NOT EXISTS music.track_audio (
  track_id    uuid PRIMARY KEY REFERENCES music.tracks(id) ON DELETE CASCADE,
  tempo_bpm   real,
  energy      real,
  valence     real,
  key         smallint,
  mode        smallint,
  analyzed_at timestamptz NOT NULL DEFAULT now()
);
