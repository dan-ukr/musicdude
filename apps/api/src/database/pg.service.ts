import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';

/** Hosted Postgres needs TLS; local docker/localhost does not. */
function sslOption() {
  const url = process.env.DATABASE_URL ?? '';
  return /@(localhost|127\.0\.0\.1|db)[:/]/.test(url) || !url
    ? undefined
    : { rejectUnauthorized: false };
}

/** Raw SQL access to the music/taste/notify/billing schemas (Prisma covers core.users only). */
@Injectable()
export class PgService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:15432/app',
    max: 10,
    ssl: sslOption(),
  });

  query<T extends QueryResultRow>(text: string, params?: unknown[]) {
    return this.pool.query<T>(text, params as never);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
