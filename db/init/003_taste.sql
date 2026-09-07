-- Taste: embeddings (pgvector) + portrait snapshots
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS taste;

CREATE TABLE IF NOT EXISTS taste.item_embeddings (
  track_id      uuid PRIMARY KEY REFERENCES music.tracks(id) ON DELETE CASCADE,
  embedding     vector(256) NOT NULL,
  model_version text NOT NULL DEFAULT 'content-v0',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS taste.user_embeddings (
  user_id       uuid PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
  embedding     vector(256) NOT NULL,
  model_version text NOT NULL DEFAULT 'content-v0',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS taste.portrait_snapshots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portrait_user_time_idx ON taste.portrait_snapshots (user_id, created_at DESC);
