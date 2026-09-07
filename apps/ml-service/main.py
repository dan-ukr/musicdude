"""MusicDude ML service.

v0 = deterministic stub: pseudo audio features + content embedding derived from a
hash of the preview URL, so the whole pipeline (worker -> /analyze -> facets ->
portrait) runs end-to-end before real librosa analysis lands.

Contract lives in packages/shared/src/contracts.ts (AnalyzeRequest/AnalyzeResponse).
Replace _pseudo_features with librosa over the downloaded 30s preview; the JSON
contract must not change. ML_ENGINE_URL remains the dormant hosted-engine escape hatch.
"""
from __future__ import annotations

import hashlib
import math
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel

EMBEDDING_DIM = 256

app = FastAPI(title="musicdude-ml", version="0.1.0")


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
    key: int
    mode: int
    embedding: List[float]


def _pseudo_features(seed_text: str) -> AnalyzeResponse:
    digest = hashlib.sha256(seed_text.encode("utf-8")).digest()

    def unit(i: int) -> float:
        return digest[i % len(digest)] / 255.0

    embedding = [
        math.sin(int.from_bytes(digest[(i % 28):(i % 28) + 4], "big") + i) for i in range(EMBEDDING_DIM)
    ]
    norm = math.sqrt(sum(x * x for x in embedding)) or 1.0
    return AnalyzeResponse(
        tempo_bpm=round(60 + unit(0) * 120, 1),
        energy=round(unit(1), 3),
        valence=round(unit(2), 3),
        key=digest[3] % 12,
        mode=digest[4] % 2,
        embedding=[round(x / norm, 6) for x in embedding],
    )


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "engine": "stub", "embedding_dim": EMBEDDING_DIM}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    return _pseudo_features(req.preview_url or req.track_id)
