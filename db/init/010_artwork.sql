-- Album art for the player, captured during resolve from iTunes/Deezer.
ALTER TABLE music.tracks ADD COLUMN IF NOT EXISTS artwork_url text;
