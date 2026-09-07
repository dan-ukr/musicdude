-- Scan jobs: one active scan per user; the Portrait progress bar polls this row.
CREATE SCHEMA IF NOT EXISTS music;

CREATE TABLE IF NOT EXISTS music.scan_jobs (
  user_id    uuid PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
  state      text NOT NULL DEFAULT 'running', -- running | done | failed
  total      int NOT NULL DEFAULT 0,
  processed  int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
