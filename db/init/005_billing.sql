-- Billing: entitlements are the API-side source of truth (RevenueCat wired at store release).
-- Local dev grants premium via dev flag, writing the same rows.
CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE IF NOT EXISTS billing.subscription_entitlements (
  user_id          uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  entitlement_name text NOT NULL DEFAULT 'premium',
  is_active        boolean NOT NULL DEFAULT false,
  provider         text NOT NULL DEFAULT 'dev',
  expires_at       timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entitlement_name)
);

CREATE TABLE IF NOT EXISTS billing.webhook_events (
  id                bigserial PRIMARY KEY,
  provider          text NOT NULL,
  provider_event_id text NOT NULL,
  payload           jsonb NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

-- Free tier: 3 playlist creations per month, own-tracks-only. Server-enforced.
CREATE TABLE IF NOT EXISTS billing.playlist_credits (
  user_id    uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  month      date NOT NULL, -- first day of month
  used       int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
