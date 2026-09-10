-- Which kind of recommendation a card was, so the app can label it and the
-- rotation can avoid repeating the same angle two days running.
ALTER TABLE music.daily_cards ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'similar';
