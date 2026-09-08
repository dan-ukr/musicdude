const ML_BASE_URL = process.env.ML_BASE_URL ?? 'http://localhost:8000';

export type AnalyzeResult = {
  tempo_bpm: number;
  energy: number;
  valence: number;
  brightness: number;
  dynamism: number;
  key: number;
  mode: number;
  /** 64-dim acoustic tower output from librosa. */
  embedding: number[];
  /** False when the preview could not be decoded and values are placeholders. */
  analyzed: boolean;
};

export async function analyze(trackId: string, previewUrl: string): Promise<AnalyzeResult | null> {
  try {
    const res = await fetch(`${ML_BASE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: trackId, preview_url: previewUrl }),
    });
    if (!res.ok) return null;
    return (await res.json()) as AnalyzeResult;
  } catch {
    return null;
  }
}
