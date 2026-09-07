import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

/** Queue names mirror apps/worker/src/queues.ts. */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
  readonly scan = new Queue('scan', { connection: this.connection });

  async onModuleDestroy() {
    await this.scan.close();
  }
}
