import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

/** Queue names mirror apps/worker/src/queues.ts. */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };

  // Finished jobs are trimmed so a small Redis plan cannot fill up with history.
  readonly scan = new Queue('scan', {
    connection: this.connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  });

  async onModuleDestroy() {
    await this.scan.close();
  }
}
