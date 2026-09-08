// Local dev reads the repo-root .env (same file the API uses); on Render the
// dashboard supplies the vars and this is a no-op. Must run before ./queues.
import * as path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { Queue, Worker, type Job } from 'bullmq';
import { QUEUES, REDIS_URL } from './queues';
import { processScan } from './jobs/scan';
import { processEnrichMusicbrainz } from './jobs/enrich-musicbrainz';

const connection = { url: REDIS_URL };

// attempts > 1 is what makes the 503 throw in the processor an actual retry;
// removeOn* keeps thousands of artist jobs from filling a small Redis plan.
const mbQueue = new Queue(QUEUES.ENRICH_MUSICBRAINZ, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

const scanWorker = new Worker(QUEUES.SCAN, (job: Job) => processScan(job, mbQueue), {
  connection,
  concurrency: 2,
});

const mbWorker = new Worker(QUEUES.ENRICH_MUSICBRAINZ, processEnrichMusicbrainz, {
  connection,
  concurrency: 1,
  // musicbrainz.org: ~1 req/s per app. The limiter is the whole point.
  limiter: { max: 1, duration: 1100 },
});

// Phase 2.5+ queues: registered so the topology is fixed, processors land later.
const stubs: Record<string, (job: Job) => Promise<void>> = {
  [QUEUES.ENRICH_PREVIEW]: async (job) => {
    console.log(`[enrich-preview] track=${job.data.trackId} — folded into scan for now`);
  },
  [QUEUES.BUILD_FACETS]: async (job) => {
    console.log(`[build-facets] user=${job.data.userId} — folded into scan for now`);
  },
  [QUEUES.PORTRAIT_REBUILD]: async (job) => {
    console.log(`[portrait-rebuild] user=${job.data.userId} — folded into scan for now`);
  },
  [QUEUES.DAILY_CARD]: async () => {
    console.log('[daily-card] not implemented yet');
  },
  [QUEUES.CARE_NOW]: async (job) => {
    console.log(`[care-now] user=${job.data.userId} — not implemented yet`);
  },
};

const stubWorkers = Object.entries(stubs).map(
  ([queue, processor]) => new Worker(queue, processor, { connection, concurrency: 5 }),
);

for (const w of [scanWorker, mbWorker, ...stubWorkers]) {
  w.on('failed', (job, err) => console.error(`[${w.name}] job ${job?.id} failed:`, err.message));
}

console.log('musicdude worker up — scan + musicbrainz live, rest stubbed');
