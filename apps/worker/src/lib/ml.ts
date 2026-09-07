const ML_BASE_URL = process.env.ML_BASE_URL ?? 'http://localhost:8000';

export type AnalyzeResult = {
  tempo_bpm: number;
  energy: number;
  valence: number;
  key: number;
  mode: number;
  embedding: number[];
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
