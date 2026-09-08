-- Acoustic tower output kept separately from the fused item vector, so the
-- fusion can be recomputed when cultural data (genres, region, language)
-- arrives later from enrichment without re-analysing the audio.
ALTER TABLE music.track_audio ADD COLUMN IF NOT EXISTS brightness real;
ALTER TABLE music.track_audio ADD COLUMN IF NOT EXISTS dynamism real;
ALTER TABLE music.track_audio ADD COLUMN IF NOT EXISTS analyzed boolean NOT NULL DEFAULT false;
ALTER TABLE music.track_audio ADD COLUMN IF NOT EXISTS acoustic vector(64);

-- Nearest-neighbour search over the fused item vectors.
CREATE INDEX IF NOT EXISTS item_embeddings_vec_idx
  ON taste.item_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
