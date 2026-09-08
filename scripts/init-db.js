/**
 * Idempotent DB init: runs every db/init/*.sql in order against DATABASE_URL.
 * All init files use IF NOT EXISTS, so re-running is safe (same pattern as WeatherDude).
 *
 * Reads DATABASE_URL from the repo-root .env, so on Windows you can just put it
 * there and run `npm run init-db` (PowerShell has no inline VAR=x cmd syntax).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:15432/app';
  const isLocal = /@(localhost|127\.0\.0\.1|db)[:/]/.test(url);
  const dir = path.join(__dirname, '..', 'db', 'init');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`target: ${url.replace(/:[^:@/]+@/, ':****@')}`);
  const client = new Client({
    connectionString: url,
    // Hosted Postgres (Render/Supabase) terminates TLS with a cert node-postgres
    // won't chain to a local root; local docker needs no TLS at all.
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const file of files) {
      process.stdout.write(`applying ${file}... `);
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      console.log('ok');
    }
    const { rows } = await client.query(
      `SELECT table_schema, count(*)::int AS tables
       FROM information_schema.tables
       WHERE table_schema IN ('core','music','taste','notify','billing')
       GROUP BY table_schema ORDER BY table_schema`,
    );
    console.log('\nschemas ready:');
    for (const r of rows) console.log(`  ${r.table_schema}: ${r.tables} tables`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Node wraps connection failures in an AggregateError whose own message is empty.
  const detail = Array.isArray(err.errors)
    ? err.errors.map((e) => e.message).join('; ')
    : err.message || String(err);
  console.error(`\nfailed: ${detail}`);
  process.exit(1);
});
