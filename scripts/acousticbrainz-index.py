"""
Build a local lookup of AcousticBrainz full-track analysis, keyed by MusicBrainz
recording id.

Why this exists: we cannot obtain full audio for commercial recordings, so every
measurement we make ourselves is limited to a 30-second preview. AcousticBrainz
analysed *complete* recordings with Essentia — Pink Floyd's "Time" is in there at
its full 426 seconds — and published the results as open data. The web API was
retired and returns nothing, but the bulk dumps are still served, so the data is
reachable even though the service is not.

The dump is ~42 GB of compressed JSON for roughly 7.5M recordings. Loading all of
it into Postgres would be wasteful and does not fit a small database, so this
script distils each recording down to the values we actually use and writes them
to a compact SQLite file (a few hundred MB) that the worker queries offline.

Usage:
    python scripts/acousticbrainz-index.py --sample          # 89 MB, for testing
    python scripts/acousticbrainz-index.py --parts 0-29      # the full 42 GB set
    python scripts/acousticbrainz-index.py --parts 0,1,2     # a subset

Output: data/acousticbrainz.sqlite  (mbid -> classifiers)
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import tarfile
import urllib.request

BASE = "https://data.metabrainz.org/pub/musicbrainz/acousticbrainz/dumps/"
FULL_DIR = "acousticbrainz-highlevel-json-20220623/"
FULL_NAME = "acousticbrainz-highlevel-json-20220623-{part}.tar.zst"
SAMPLE_DIR = "acousticbrainz-sample-json-20220623/"
SAMPLE_NAME = "acousticbrainz-highlevel-sample-json-20220623-0.tar.zst"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "acousticbrainz.sqlite")

# The classifiers worth keeping. Each is stored as its label plus the model's
# probability, so downstream code can refuse anything the model was unsure about.
CLASSIFIERS = [
    "voice_instrumental",
    "gender",
    "timbre",
    "danceability",
    "tonal_atonal",
    "mood_acoustic",
    "mood_aggressive",
    "mood_electronic",
    "mood_happy",
    "mood_party",
    "mood_relaxed",
    "mood_sad",
    "moods_mirex",
    "genre_dortmund",
    "genre_electronic",
    "genre_rosamerica",
    "genre_tzanetakis",
    "ismir04_rhythm",
]

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS analysis (
  mbid TEXT PRIMARY KEY,
  length REAL,
  {", ".join(f"{c} TEXT, {c}_p REAL" for c in CLASSIFIERS)}
);
"""


def open_db() -> sqlite3.Connection:
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=OFF")
    conn.executescript(SCHEMA)
    return conn


def row_from(payload: dict) -> tuple | None:
    # Some entries carry a null metadata or highlevel block; skip rather than
    # crash a multi-hour ingest on one malformed record.
    if not isinstance(payload, dict):
        return None
    meta = payload.get("metadata") or {}
    tags = meta.get("tags") or {}
    mbids = tags.get("musicbrainz_recordingid") or []
    if not mbids:
        return None
    high = payload.get("highlevel") or {}
    if not high:
        return None

    values: list = [mbids[0], (meta.get("audio_properties") or {}).get("length")]
    for name in CLASSIFIERS:
        entry = high.get(name) or {}
        if not isinstance(entry, dict):
            entry = {}
        values.append(entry.get("value"))
        values.append(entry.get("probability"))
    return tuple(values)


def stream_part(url: str, conn: sqlite3.Connection, label: str) -> int:
    import zstandard as zstd

    placeholders = ",".join("?" * (2 + len(CLASSIFIERS) * 2))
    insert = f"INSERT OR REPLACE INTO analysis VALUES ({placeholders})"

    request = urllib.request.Request(url, headers={"User-Agent": "MusicDude/0.1"})
    written = 0
    batch: list[tuple] = []
    dctx = zstd.ZstdDecompressor()

    with urllib.request.urlopen(request) as response:
        with dctx.stream_reader(response) as reader:
            # Streamed, never written to disk: 42 GB does not need to land here.
            with tarfile.open(fileobj=reader, mode="r|") as tar:
                for member in tar:
                    if not member.isfile() or not member.name.endswith(".json"):
                        continue
                    handle = tar.extractfile(member)
                    if handle is None:
                        continue
                    try:
                        row = row_from(json.load(handle))
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        continue
                    if row is None:
                        continue
                    batch.append(row)
                    if len(batch) >= 5000:
                        conn.executemany(insert, batch)
                        conn.commit()
                        written += len(batch)
                        batch.clear()
                        print(f"  {label}: {written:,} recordings", end="\r", flush=True)
    if batch:
        conn.executemany(insert, batch)
        conn.commit()
        written += len(batch)
    print(f"  {label}: {written:,} recordings written")
    return written


def parse_parts(spec: str) -> list[int]:
    parts: list[int] = []
    for chunk in spec.split(","):
        if "-" in chunk:
            start, end = chunk.split("-")
            parts.extend(range(int(start), int(end) + 1))
        else:
            parts.append(int(chunk))
    return parts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", action="store_true", help="89 MB sample instead of the full dump")
    ap.add_argument("--parts", default="0-29", help="parts of the full dump, e.g. 0-29 or 0,1,2")
    args = ap.parse_args()

    conn = open_db()
    total = 0
    if args.sample:
        total += stream_part(BASE + SAMPLE_DIR + SAMPLE_NAME, conn, "sample")
    else:
        for part in parse_parts(args.parts):
            url = BASE + FULL_DIR + FULL_NAME.format(part=part)
            total += stream_part(url, conn, f"part {part}")

    count = conn.execute("SELECT count(*) FROM analysis").fetchone()[0]
    conn.execute("ANALYZE")
    conn.close()
    size_mb = os.path.getsize(DB_PATH) / 1e6
    print(f"\nadded {total:,} | index now holds {count:,} recordings | {size_mb:.0f} MB")
    print(f"index: {DB_PATH}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
