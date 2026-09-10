# Roadmap v2 — depth pass (stats.fm-grade)

Reference experience: stats.fm. Its lesson is that people pay for *depth about
themselves* plus *things they can act on*. Everything below is organised that way.

---

## 0. Feasibility findings (tested 2026-09-11, before designing)

| Source | Result | Consequence |
|---|---|---|
| **AcousticBrainz API** (full-track Essentia features, per-MBID) | Answers `200` but returns nothing — 0 hits across 9 famous recordings. The service was retired. | API is dead — but see the next row. |
| **AcousticBrainz bulk dumps** | **Still published and downloadable.** 41.8 GB of high-level JSON across 30 parts (plus an 89 MB sample), ~7.5M recordings, keyed by MusicBrainz recording id. Verified: Pink Floyd "Time" is present at its full 426 s with 18 classifiers. | **This is the full-track source.** The service is gone; the data is not. |
| **MusicBrainz sample relationships** | 0 relations on Kanye "Stronger", Avalanches "Frontier Psychiatrist" — tracks famous for sampling. The relationship type exists in the schema but is not populated at useful density. | Cannot power a samples feature. |
| **Spotify `audio-analysis`** (sections, segments, bars — real structure) | Deprecated Nov 2024, `403` for new apps. | Confirmed closed, as established earlier. |
| **Ticketmaster Discovery** | `401` without a key; free key available on signup. | The single biggest unlock for Events. Needs a 2-minute signup. |

**What this means for "analyse the whole track".** We cannot download full audio
for commercial hits, but we do not have to: AcousticBrainz already analysed
complete recordings and published the results. Ingesting those dumps gives, per
recording, analysis of the *entire* track rather than a 30-second excerpt:

- `voice_instrumental` and `gender` — is there a singer, and which register
- `timbre` (dark/bright), `danceability`, `tonal_atonal`
- seven mood classifiers (happy, sad, aggressive, relaxed, party, acoustic,
  electronic) trained on full tracks — far better than the valence proxy we
  compute from a preview
- genre in four independent taxonomies, plus a rhythm classifier

`scripts/acousticbrainz-index.py` streams the dumps and distils them into a local
SQLite index; the ML service serves lookups at `GET /analysis/{mbid}`. Verified
on the sample: 88,814 recordings, 42 MB, average track length 224 s.

Still **not** deliverable from this source: section maps (verse/chorus) and
sample lineage — AcousticBrainz stores global descriptors, not segmentation.
For those, the remaining honest routes are:

1. **Instrument and voice detection from the preview** — Essentia's pretrained
   models (or a small CNN on mel-spectrograms) classify instrumentation,
   voice/instrumental, and broad texture from 30 s. Real, runs on CPU, ships now.
2. **The preview usually *is* the hook.** Labels pick the most recognisable
   segment for previews. So "analyse the hook" is already what we do — it should
   be *named* that in the UI rather than apologised for.
3. **Within-clip structure** — a self-similarity matrix over the 30 s detects
   whether the clip contains a transition (build, drop, section change). Gives a
   `has_transition` + `dynamism` pair, which is honest and useful.
4. **Full-track analysis for local files, on device** (v2) — the user's own
   audio never leaves the phone; we upload only derived features. Legally clean,
   full structure, but only for users who have files.

Recommendation: ship 1–3 now, frame as "hook analysis", keep 4 as the honest
upgrade path. Do not promise structure maps for streamed hits.

---

## 1. Portrait — narrative explanations

Today the portrait is charts with no prose. stats.fm's pull is that it *tells you
what you are*.

**Approach: facts scripted, prose optional.**
- A deterministic narrative builder turns the facet distributions into claims
  ("three quarters of your library sits in two decades", "your rare-taste
  percentile is 78"). Free, translatable, never hallucinates.
- An optional LLM pass rewrites those claims into flowing text *in the user's
  language*. Gated behind a key so the app works without it.

Why not LLM-first: the numbers must be right and translatable into 11 languages;
an LLM writing the facts risks confident nonsense about a person, which is the
one thing the spec says never to do.

**Open decision:** add an LLM key (which provider), or stay fully scripted?

---

## 2. Daily card — recommendation, not shuffle

Current behaviour is `ORDER BY random()`, which is indefensible.

**New selection:**
1. Build a *recent-listening centroid* from the last 24–48 h of `music.plays`.
2. Rank candidates by similarity to that centroid, not to the all-time profile.
3. Exclude anything shown in 30 days; apply mood guardrails (iso-principle for
   "get me out").
4. The reason names the *actual* evidence: "because you played Океан Ельзи and
   Go_A yesterday — this shares their language and era".

**Honest dependency:** we only have real timestamps from GDPR imports right now.
Live 24 h behaviour needs the passive collectors (Android notification scrobbler,
Last.fm link). Until then the window falls back to most-recently-added.

**More card types** (rotating, each with its own reason):
- *Because you played X* — nearest neighbour to one specific recent track
- *Forgotten favourite* — high play count, not played in 6+ months
- *New from an artist you love* — recent release by a library artist
- *Bridge* — nearest track in a region/language absent from the library
- *Deep cut* — rare-bucket track by an artist the user only knows through hits

---

## 3. Library — browse, add, compatibility %

Today Library only filters what you own.

- **Discover mode**: the same facet chips, but querying the *catalogue* rather
  than the user's library, with an **Add** action per track.
- **Compatibility %** on every row: cosine between the user tower and the item
  tower, rescaled so the visible range is meaningful (raw cosines cluster high).
- Sort by compatibility, rarity, or recency.

---

## 4. Analysis depth

Ship: instrument/voice tags, hook framing, transition detection (see §0).
Defer with reasons stated in-product: full structure maps, sample lineage.

New facets unlocked: `instrumentation` (guitar-led, synth-led, piano, strings,
vocal-only), `voice` (male/female/instrumental), `texture` (acoustic/electronic).

---

## 5. Friends tab

*Left blank in the brief — needs the user's intent before building.*

---

## 6. Events — make it actually work

Current state: MusicBrainz only, sparse, and asks the user to type a city.

- **GPS instead of a text field** — `expo-location`, with a manual override.
- **Ticketmaster Discovery** as the primary source (free key, wide coverage,
  real venues and dates). MusicBrainz stays as a secondary for indie/EU events
  Ticketmaster misses.
- **Compatibility % per event** — match the event's artist against the user
  tower, same scale as Library.
- **Library-style filters** — genre, era, region, plus distance and date range.
- Default sort: taste compatibility. Then browsable by city.

**Blocker:** needs a free Ticketmaster API key.

---

## 7. Social graph

- **Graph view**: friends as nodes, edge thickness = compatibility, laid out by
  a small force simulation in SVG. Tapping an edge opens the pair view.
- **Pair view**: what is *shared* and what is *different*, as categories
  (genres, languages, eras, regions) **and** as a text summary.
- **Blend playlist** with three explicit buckets:
  1. my tracks they should like (my library ∩ near *their* centroid)
  2. their tracks I should like (their library ∩ near *my* centroid)
  3. new to both (catalogue ∩ near the midpoint of both centroids)

Hard rule preserved: the social layer is built on the **taste** vector only.
Mood never leaves the owner's app.

---

## 8. Paywall, revised

The current split (2 filters, 3 playlists, 30-day history) is arbitrary and
mostly caps things that feel like they should be free.

**Proposed line: free is *your mirror*, premium is *depth + action + others*.**

| | Free | Premium |
|---|---|---|
| Portrait | Charts + a short narrative | Full narrative, time-of-day selves, full blind-spot map, HD/animated export |
| Daily card | One card, both buttons, one reason sentence | All card types, several a day, the unfolded reason graph |
| Library (own) | Unlimited filtering and browsing | Saved smart filters, sort by rarity |
| Discover (catalogue) | 10 discoveries a day with compatibility % | Unlimited discovery + add |
| Analysis | Hook summary per track | Instrument/texture breakdown, transition view |
| Playlists | 3 a month, own tracks | Unlimited, blends, living playlists |
| Events | Browse matched, GPS | Alerts, radius/date filters, calendar export |
| Social | Compare by link with anyone (always free — it is the growth loop) | Saved friends, the graph, blend playlists |
| Change | Last 30 days | Full history, shift narratives, forecast |

Two principles kept: **anything that lands on a non-user stays free** (compare
links, shared portraits), and **we never cap how much of themselves we show** —
only how often the tool does work *for* them.

Price stays €3.99/mo.
