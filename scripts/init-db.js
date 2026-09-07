/**
 * Idempotent DB init: runs every db/init/*.sql in order against DATABASE_URL.
 * All init files use IF NOT EXISTS, so re-running is safe (same pattern as WeatherDude).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:15432/app';
  const dir = path.join(__dirname, '..', 'db', 'init');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of files) {
      process.stdout.write(`applying ${file}... `);
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      console.log('ok');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
