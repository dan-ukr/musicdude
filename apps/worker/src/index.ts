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

// musicbrainz.org allows ~1 req/s per client and there are no API keys to
// rotate, so the limiter plus batching is the entire strategy. 1.3s leaves
// headroom for the burst detection that produced 503s at 1.1s; a 503 still
// pauses the queue for its Retry-After via RateLimitError in the processor.
// Self-hosting a mirror (MUSICBRAINZ_BASE_URL) is the only way past the limit.
const mbWorker: Worker = new Worker(
  QUEUES.ENRICH_MUSICBRAINZ,
  (job: Job) => processEnrichMusicbrainz(job, mbWorker),
  { connection, concurrency: 1, limiter: { max: 1, duration: 1300 } },
);

// Only queues with real processors get a Worker: every idle Worker holds Redis
// connections, and the free plan allows 30. The remaining queue names live in
// ./queues.ts and get workers when their processors are written.
for (const w of [scanWorker, mbWorker]) {
  w.on('failed', (job, err) => console.error(`[${w.name}] job ${job?.id} failed:`, err.message));
}

console.log(`musicdude worker up — queues: ${QUEUES.SCAN}, ${QUEUES.ENRICH_MUSICBRAINZ}`);
