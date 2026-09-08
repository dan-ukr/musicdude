-- Genres: multi-valued canonical MusicBrainz genres per track, filterable via GIN.
ALTER TABLE music.track_facets ADD COLUMN IF NOT EXISTS genres text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS track_facets_genres_idx ON music.track_facets USING gin (genres);
