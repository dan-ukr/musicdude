import { Pool } from 'pg';

const url = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:15432/app';

export const db = new Pool({
  connectionString: url,
  max: 5,
  // Hosted Postgres needs TLS; local docker/localhost does not.
  ssl: /@(localhost|127\.0\.0\.1|db)[:/]/.test(url) ? undefined : { rejectUnauthorized: false },
});

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
