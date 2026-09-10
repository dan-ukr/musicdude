"""MusicDude ML service — acoustic tower.

Downloads the 30-second preview and measures it with librosa. Nothing here is
calibrated against another service's scale: every track in the catalogue is
measured by this same code, so the space is self-consistent by construction
and comparisons between tracks are valid.

What comes out:
  * interpretable features (tempo, energy, brightness, key, mode, dynamism)
  * a 64-dimension acoustic embedding (MFCC timbre + chroma + spectral shape),
    L2-normalised — the acoustic half of the two-tower item representation.
    The cultural half is built by the worker from MusicBrainz/Wikidata data.

The preview is chorus-biased by construction (labels pick the hook), so
`dynamism` — how much the signal moves inside the clip — is reported alongside
the averages and lets downstream code know how much to trust a single number.
"""
from __future__ import annotations

import hashlib
import math
import os
import tempfile
from typing import Any, Dict, List, Optional

import numpy as np
import requests
from fastapi import FastAPI
from pydantic import BaseModel

EMBEDDING_DIM = 64
SAMPLE_RATE = 22050
MAX_SECONDS = 30
DOWNLOAD_TIMEOUT_S = 20

app = FastAPI(title="musicdude-ml", version="0.2.0")

try:
    import librosa

    LIBROSA_AVAILABLE = True
except Exception:  # pragma: no cover - service still answers without it
    LIBROSA_AVAILABLE = False


class AnalyzeRequest(BaseModel):
    track_id: str
    preview_url: str
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        extra = "ignore"


class AnalyzeResponse(BaseModel):
    tempo_bpm: float
    energy: float
    valence: float
    brightness: float
    dynamism: float
    key: int
    mode: int
    embedding: List[float]
    analyzed: bool  # False when the audio could not be decoded

    # --- what the recording is made of ---
    # Ratio of percussive to total energy: drums-forward vs sustained material.
    percussiveness: float = 0.0
    # Sustained, low-flux harmonic content: strings, pads, held chords.
    sustain: float = 0.0
    # Sharp attacks per second: piano, plucked strings, programmed drums.
    onset_rate: float = 0.0
    # Confidence that a human voice is present, from vocal-band modulation.
    vocal_confidence: float = 0.0
    # Coarse instrumentation labels, most prominent first.
    instrumentation: List[str] = []

    # --- shape of the excerpt ---
    # Distinct sections detected inside the clip via self-similarity.
    segments: int = 1
    # A section change is audible in the excerpt (build, drop, verse->chorus).
    has_transition: bool = False
    # Energy trajectory across the excerpt: rising, falling or steady.
    contour: str = "steady"


AB_INDEX_PATH = os.environ.get(
    "AB_INDEX_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "acousticbrainz.sqlite"),
)


def _ab_connection():
    """Read-only handle to the AcousticBrainz index, or None when absent."""
    if not os.path.exists(AB_INDEX_PATH):
        return None
    import sqlite3

    conn = sqlite3.connect(f"file:{AB_INDEX_PATH}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


AB_DB = _ab_connection()


@app.get("/health")
def health() -> Dict[str, Any]:
    indexed = 0
    if AB_DB is not None:
        try:
            indexed = AB_DB.execute("SELECT count(*) FROM analysis").fetchone()[0]
        except Exception:  # noqa: BLE001
            indexed = -1
    return {
        "status": "ok",
        "engine": "librosa" if LIBROSA_AVAILABLE else "unavailable",
        "embedding_dim": EMBEDDING_DIM,
        "full_track_index": indexed,
    }


@app.get("/analysis/{mbid}")
def full_track_analysis(mbid: str) -> Dict[str, Any]:
    """
    Analysis of the *complete* recording, from AcousticBrainz.

    We cannot obtain full audio for commercial tracks, so everything we measure
    ourselves comes from a 30-second preview. AcousticBrainz ran Essentia over
    whole recordings and published the results; the web service was retired but
    the bulk dumps are still available, so the data is reachable even though the
    API is not. `scripts/acousticbrainz-index.py` distils those dumps into the
    local index this endpoint reads.
    """
    if AB_DB is None:
        return {"found": False, "reason": "index not built"}
    row = AB_DB.execute("SELECT * FROM analysis WHERE mbid = ?", (mbid,)).fetchone()
    if row is None:
        return {"found": False}

    data = dict(row)
    classifiers = {}
    for key, value in list(data.items()):
        if key in ("mbid", "length") or key.endswith("_p"):
            continue
        classifiers[key] = {"value": value, "probability": data.get(f"{key}_p")}
    return {
        "found": True,
        "mbid": data["mbid"],
        "length_seconds": data["length"],
        "classifiers": classifiers,
    }


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    if not LIBROSA_AVAILABLE:
        return _fallback(req)
    try:
        samples = _download_and_load(req.preview_url)
        if samples is None:
            return _fallback(req)
        return _features(samples)
    except Exception as exc:  # noqa: BLE001 - one bad track must not stop a scan
        print(f"[analyze] {req.track_id} failed: {exc}")
        return _fallback(req)


def _download_and_load(url: str) -> Optional[np.ndarray]:
    """Fetch the preview to a temp file and decode it to mono at 22.05 kHz."""
    response = requests.get(url, timeout=DOWNLOAD_TIMEOUT_S)
    if response.status_code != 200 or not response.content:
        return None

    suffix = ".mp3" if ".mp3" in url.lower() else ".m4a"
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(response.content)
            path = handle.name
        audio, _ = librosa.load(path, sr=SAMPLE_RATE, mono=True, duration=MAX_SECONDS)
        return audio if audio.size > SAMPLE_RATE else None
    finally:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass


def _features(y: np.ndarray) -> AnalyzeResponse:
    stft = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))

    tempo = float(np.atleast_1d(librosa.beat.tempo(y=y, sr=SAMPLE_RATE))[0])
    rms = librosa.feature.rms(S=stft)[0]
    centroid = librosa.feature.spectral_centroid(S=stft, sr=SAMPLE_RATE)[0]
    rolloff = librosa.feature.spectral_rolloff(S=stft, sr=SAMPLE_RATE)[0]
    bandwidth = librosa.feature.spectral_bandwidth(S=stft, sr=SAMPLE_RATE)[0]
    flatness = librosa.feature.spectral_flatness(S=stft)[0]
    zcr = librosa.feature.zero_crossing_rate(y)[0]
    mfcc = librosa.feature.mfcc(y=y, sr=SAMPLE_RATE, n_mfcc=20)
    chroma = librosa.feature.chroma_stft(S=stft, sr=SAMPLE_RATE)

    # Loudness relative to a fixed reference, squashed to 0..1.
    energy = _squash(float(np.mean(rms)) / 0.12)
    # Spectral centroid over the audible band as a brightness proxy.
    brightness = _squash(float(np.mean(centroid)) / 4000.0)
    # How much the clip moves: the honest counterweight to a 30s average.
    dynamism = _squash(float(np.std(rms)) / max(float(np.mean(rms)), 1e-6))

    key, mode = _estimate_key(chroma)
    # No ground-truth valence exists for us, so this is an explicit proxy:
    # major mode, brighter spectrum and faster tempo read as more positive.
    valence = _squash(
        0.45 * (1.0 if mode == 1 else 0.0)
        + 0.35 * brightness
        + 0.20 * _squash((tempo - 60.0) / 120.0)
    )

    embedding = _embedding(mfcc, chroma, centroid, rolloff, bandwidth, flatness, zcr, rms, tempo)
    texture = _texture(y, stft, mfcc)
    shape = _shape(y, mfcc, chroma, rms)

    return AnalyzeResponse(
        percussiveness=round(texture["percussiveness"], 4),
        sustain=round(texture["sustain"], 4),
        onset_rate=round(texture["onset_rate"], 3),
        vocal_confidence=round(texture["vocal_confidence"], 4),
        instrumentation=texture["instrumentation"],
        segments=shape["segments"],
        has_transition=shape["has_transition"],
        contour=shape["contour"],
        tempo_bpm=round(tempo, 1),
        energy=round(energy, 4),
        valence=round(valence, 4),
        brightness=round(brightness, 4),
        dynamism=round(dynamism, 4),
        key=int(key),
        mode=int(mode),
        embedding=embedding,
        analyzed=True,
    )


def _texture(y: np.ndarray, stft: np.ndarray, mfcc: np.ndarray) -> Dict[str, Any]:
    """
    What the recording is made of, from the signal rather than from metadata.

    Harmonic/percussive separation splits drums from sustained material; the
    balance between them, how sharply notes start, and how much the vocal band
    fluctuates are enough to name the instrumentation in coarse terms. These are
    measurements of a real signal, not classifier guesses — deliberately broad
    labels, because a 30-second excerpt cannot support finer claims.
    """
    harmonic, percussive = librosa.effects.hpss(y)
    h_energy = float(np.mean(harmonic**2))
    p_energy = float(np.mean(percussive**2))
    percussiveness = _squash(p_energy / max(h_energy + p_energy, 1e-9))

    onset_env = librosa.onset.onset_strength(y=y, sr=SAMPLE_RATE)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=SAMPLE_RATE)
    duration = max(len(y) / SAMPLE_RATE, 1e-6)
    onset_rate = float(len(onsets)) / duration

    # Sustained material barely changes frame to frame; plucked and struck
    # sounds do. Flux is normalised by the signal's own magnitude, otherwise
    # quiet recordings read as sustained and loud ones as none.
    h_stft = np.abs(librosa.stft(harmonic, n_fft=2048, hop_length=512))
    flux = float(np.mean(np.abs(np.diff(h_stft, axis=1))))
    relative_flux = flux / max(float(np.mean(h_stft)), 1e-9)
    sustain = _squash(1.0 - relative_flux / 0.6)

    # Voice presence is NOT inferred from the audio here. Spectral activity in
    # the vocal band scores solo piano and jazz trumpet as high as a singer —
    # measured at 0.77 for Debussy and 0.73 for Miles Davis, both instrumental.
    # The lyrics source already answers this exactly, so the worker fills it in
    # from there rather than guessing from 30 seconds.

    # Only labels the measurements actually support. Two reliable axes beat
    # five unreliable ones: percussive/sustained is separable, "electronic vs
    # acoustic" from spectral flatness alone was not (it called Nirvana
    # electronic).
    labels: List[str] = []
    if percussiveness > 0.5:
        labels.append("percussive")
    elif percussiveness < 0.15:
        labels.append("smooth")
    if sustain > 0.6:
        labels.append("sustained")
    if onset_rate > 4.0:
        labels.append("busy")
    elif onset_rate < 1.5:
        labels.append("sparse")

    return {
        "percussiveness": percussiveness,
        "sustain": sustain,
        "onset_rate": onset_rate,
        "vocal_confidence": 0.0,
        "instrumentation": labels,
    }


def _shape(y: np.ndarray, mfcc: np.ndarray, chroma: np.ndarray, rms: np.ndarray) -> Dict[str, Any]:
    """
    Structure *within* the excerpt.

    Full song structure needs the whole recording, which we cannot obtain for
    commercial tracks. What a 30-second excerpt does support is whether it holds
    more than one section — a build, a drop, a verse running into a chorus — via
    a self-similarity recurrence matrix over timbre and harmony. That is a real
    structural statement about the part of the song we actually have.
    """
    try:
        features = np.vstack([librosa.util.normalize(mfcc), librosa.util.normalize(chroma)])
        # Sub-sample: boundary detection wants a coarse view, not every frame.
        step = max(features.shape[1] // 120, 1)
        reduced = features[:, ::step]
        n_segments = int(min(max(reduced.shape[1] // 20, 2), 6))
        boundaries = librosa.segment.agglomerative(reduced, n_segments)
        segments = int(len(np.unique(boundaries)))
    except Exception:  # noqa: BLE001 - structure is optional, never fatal
        segments = 1

    thirds = np.array_split(rms, 3)
    means = [float(np.mean(t)) for t in thirds if t.size]
    contour = "steady"
    if len(means) == 3:
        rise = (means[2] - means[0]) / max(means[0], 1e-6)
        if rise > 0.25:
            contour = "rising"
        elif rise < -0.25:
            contour = "falling"

    # A transition is audible when the sections differ enough to be heard,
    # not merely enough to be measured.
    has_transition = segments >= 3 or contour != "steady"

    return {"segments": segments, "has_transition": bool(has_transition), "contour": contour}


def _estimate_key(chroma: np.ndarray) -> tuple[int, int]:
    """Krumhansl-style profile correlation: strongest key, then major vs minor."""
    profile = np.mean(chroma, axis=1)
    major = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    best_key, best_mode, best_score = 0, 1, -np.inf
    for shift in range(12):
        rotated = np.roll(profile, -shift)
        for mode_value, template in ((1, major), (0, minor)):
            score = float(np.corrcoef(rotated, template)[0, 1])
            if np.isfinite(score) and score > best_score:
                best_key, best_mode, best_score = shift, mode_value, score
    return best_key, best_mode


def _embedding(mfcc, chroma, centroid, rolloff, bandwidth, flatness, zcr, rms, tempo) -> List[float]:
    """
    Timbre + harmony + spectral shape, L2-normalised to 64 dimensions.

    MFCC[0] is dropped on purpose: it tracks overall loudness, and leaving it in
    dominates the vector so strongly that every track looks alike (a rock song
    and a piano piece measured at cosine 0.97). The remaining coefficients are
    scaled to comparable ranges and the vector is mean-centred, so direction
    carries timbre rather than volume.
    """
    parts = [
        np.mean(mfcc[1:], axis=1) / 25.0,   # 19 - timbre centre, loudness removed
        np.std(mfcc[1:], axis=1) / 15.0,    # 19 - timbre movement
        (np.mean(chroma, axis=1) - 0.5) * 2,  # 12 - pitch-class profile, centred
        np.array(
            [
                np.mean(centroid) / 4000.0,
                np.std(centroid) / 4000.0,
                np.mean(rolloff) / 8000.0,
                np.mean(bandwidth) / 4000.0,
                np.mean(flatness) * 10.0,
                np.mean(zcr) * 5.0,
                np.mean(rms) / 0.12,
                np.std(rms) / 0.12,
                (tempo - 120.0) / 60.0,
            ]
        ),                                   # 9 - spectral shape and pulse
    ]
    vector = np.concatenate(parts).astype(np.float64)
    if vector.size < EMBEDDING_DIM:
        vector = np.pad(vector, (0, EMBEDDING_DIM - vector.size))
    vector = vector[:EMBEDDING_DIM]
    vector = np.nan_to_num(vector, nan=0.0, posinf=0.0, neginf=0.0)
    vector = vector - float(np.mean(vector))
    norm = float(np.linalg.norm(vector)) or 1.0
    return [round(float(v), 6) for v in (vector / norm)]


def _squash(value: float) -> float:
    """Clamp an unbounded ratio into 0..1 without a hard cutoff."""
    if not math.isfinite(value):
        return 0.0
    return float(min(max(value, 0.0), 1.0))


def _fallback(req: AnalyzeRequest) -> AnalyzeResponse:
    """
    Deterministic stand-in when the audio cannot be decoded (no ffmpeg for an
    m4a, a dead URL). Marked analyzed=False so callers can tell measurement
    from placeholder instead of silently trusting a number.
    """
    digest = hashlib.sha256((req.preview_url or req.track_id).encode("utf-8")).digest()
    unit = lambda i: digest[i % len(digest)] / 255.0  # noqa: E731
    vector = np.array([math.sin(digest[i % len(digest)] + i) for i in range(EMBEDDING_DIM)])
    vector /= float(np.linalg.norm(vector)) or 1.0
    return AnalyzeResponse(
        tempo_bpm=round(60 + unit(0) * 120, 1),
        energy=round(unit(1), 4),
        valence=round(unit(2), 4),
        brightness=round(unit(3), 4),
        dynamism=round(unit(4), 4),
        key=digest[5] % 12,
        mode=digest[6] % 2,
        embedding=[round(float(v), 6) for v in vector],
        analyzed=False,
    )
