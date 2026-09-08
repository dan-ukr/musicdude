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


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "engine": "librosa" if LIBROSA_AVAILABLE else "unavailable",
        "embedding_dim": EMBEDDING_DIM,
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

    return AnalyzeResponse(
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
