-- Notifications: two independent channels with separate toggles (non-negotiable).
-- song_of_day: scheduled, learned send hour. care: reactive, no time of its own, capped.
CREATE SCHEMA IF NOT EXISTS notify;

CREATE TABLE IF NOT EXISTS notify.channel_prefs (
  user_id             uuid PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
  song_of_day_enabled boolean NOT NULL DEFAULT false, -- opt-in asked after portrait, never on first launch
  care_enabled        boolean NOT NULL DEFAULT false,
  learned_send_hour   smallint, -- song-of-day only
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Sent log enforces frequency caps: 1 care/session, 1/mood/day, never same phrasing twice
CREATE TABLE IF NOT EXISTS notify.sent_log (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  channel      text NOT NULL, -- song-of-day | care
  mood_tag     text,
  phrasing_key text,
  sent_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sent_log_user_time_idx ON notify.sent_log (user_id, sent_at DESC);
