# MusicDude

A taste compass that lives on top of the music you already have. Not a player, not a streaming service — a mirror (taste portrait), a tool (facet filter + playlist creation), and a ritual (daily card + two notification channels), plus taste-matched events nearby.

Spec: `architecture-v0.3.md` (three value layers: Mirror / Tool / Ritual). Architecture mirrors WeatherDude.

## Monorepo

```text
musicdude/
├── apps/
│   ├── api/         # NestJS API (auth, library, portrait, playlists, events, billing)
│   ├── mobile/      # Expo React Native app (Expo Router, 11 languages, dark theme)
│   ├── worker/      # BullMQ jobs: scan, enrichment, facets, daily card, care-now
│   └── ml-service/  # FastAPI: /analyze (preview audio features), /recommend (stub → trained towers later)
├── db/init/         # Numbered SQL migrations (schemas: core, music, taste, notify, billing)
├── docker/          # docker-compose.dev.yml (pgvector, redis, ml)
└── packages/shared/ # Shared types & contracts (facets, DTOs)
```

## Engine (all-in-one)

Ingestion is pluggable (no Spotify dev app needed): iTunes Search + Deezer for metadata/30s previews, MusicBrainz for the cultural graph, user imports (playlist links, Spotify GDPR export, manual search-add, demo library). The **Scan** worker pipeline resolves each track → graph features → preview audio analysis → facet index (`language / mood / era / region / tempo / rarity`, honest `unknown`, never guessed) → embeddings (pgvector). Recommendation: content-similarity first; two-tower + graph model trained offline later, weights served from `ml-service`. `ML_ENGINE_URL` remains a dormant hosted-engine escape hatch.

## i18n

11 languages: en, fr, it, es, pt, uk, pl, be, de, hr, tr. Phrase-keyed dictionaries in `apps/mobile/src/i18n/locales/`, `useT()` hook everywhere, no hardcoded user-facing strings. Tracked in `user_facing_strings.csv`.

## Run (local dev)

```bash
npm install
npm run docker:infra     # postgres(pgvector) + redis + ml
npm run api:dev          # NestJS on :3000
npm run worker:dev       # BullMQ worker
npm run mobile:start     # Expo
```

DB tables are created automatically from `db/init/*.sql` on first postgres container start.
