/**
 * Regenerates packages/shared/src/genres.ts from the complete, current
 * MusicBrainz genre list. Run whenever the vocabulary should be refreshed:
 *   node scripts/update-genres.js
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const res = await fetch('https://musicbrainz.org/ws/2/genre/all?fmt=txt', {
    headers: { 'User-Agent': 'MusicDude/0.1.0 (contact@musicdude.app)' },
  });
  if (!res.ok) throw new Error(`MusicBrainz genre list: HTTP ${res.status}`);
  const text = await res.text();
  const genres = [...new Set(text.split('\n').map((s) => s.trim()).filter(Boolean))].sort();
  if (genres.length < 500) throw new Error(`Suspiciously short list (${genres.length}) — aborting`);

  const header = [
    '/**',
    ' * Canonical genre vocabulary — the complete MusicBrainz genre list.',
    ` * Generated from https://musicbrainz.org/ws/2/genre/all (fetched ${new Date().toISOString().slice(0, 10)}).`,
    ' * Regenerate with: node scripts/update-genres.js',
    ' * Genre names are displayed as-is by industry convention (not translated).',
    ' */',
    '',
  ].join('\n');

  const list = genres.map((g) => `  ${JSON.stringify(g)},`).join('\n');
  const body = `export const GENRES: readonly string[] = [\n${list}\n];\n\nexport const GENRE_SET: ReadonlySet<string> = new Set(GENRES);\n`;

  const out = path.join(__dirname, '..', 'packages', 'shared', 'src', 'genres.ts');
  fs.writeFileSync(out, header + body);
  console.log(`genres.ts written: ${genres.length} genres`);
  console.log(
    'spot-check:',
    genres.filter((g) => ['synthwave', 'amapiano', 'hyperpop', 'drill', 'phonk', 'shoegaze'].includes(g)).join(', '),
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
