import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:15432/app',
  max: 5,
});

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
