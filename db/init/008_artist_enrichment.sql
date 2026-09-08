-- Artist enrichment bookkeeping: Wikidata identity, the artist's own working
-- languages, and a marker so a resolved artist is never looked up twice.
ALTER TABLE music.artists ADD COLUMN IF NOT EXISTS wikidata_qid text;
ALTER TABLE music.artists ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}';
ALTER TABLE music.artists ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

-- Artists arrive by name from imports; MusicBrainz ids appear later (or never).
CREATE UNIQUE INDEX IF NOT EXISTS artists_name_lower_idx ON music.artists (lower(name));
