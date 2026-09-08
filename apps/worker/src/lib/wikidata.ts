/**
 * Wikidata fallback for artists MusicBrainz cannot place.
 *
 * Chosen over scraping a web search: Wikidata is free, keyless, and returns
 * *structured* values — an ISO 3166-1 country code and ISO 639-1 language codes —
 * so nothing has to be parsed out of prose or guessed from a snippet.
 *
 * Two requests per artist: entity search, then one SPARQL query for
 *   P495 country of origin / P27 citizenship -> P297 ISO code
 *   P1412 languages spoken or written -> P218 ISO 639-1 code
 * Only music-related entities are accepted, so a same-named company or film
 * cannot contaminate the facet index.
 */
const USER_AGENT = 'MusicDude/0.1.0 (contact@musicdude.app)';
const SEARCH_URL = 'https://www.wikidata.org/w/api.php';
const SPARQL_URL = 'https://query.wikidata.org/sparql';

export type WikidataArtist = {
  qid: string;
  countryCode: string | null;
  languages: string[];
  genreLabels: string[];
};

/**
 * Languages nobody records pop music in. P1412 covers what an artist reads and
 * writes, so classical composers surface Latin — a confidently wrong label on
 * an instrumental track, which costs more trust than an honest gap.
 */
const NON_SUNG_LANGUAGES = new Set(['la', 'grc', 'ang', 'sa', 'cu']);

type SearchResponse = { search?: { id: string; label?: string; description?: string }[] };

/** Descriptions of non-music entities that share artist names. */
const MUSIC_HINTS = [
  'band', 'singer', 'musician', 'rapper', 'group', 'duo', 'artist', 'composer',
  'songwriter', 'dj', 'orchestra', 'ensemble', 'producer', 'guitarist', 'pianist',
  'vocalist', 'performer', 'music',
];

export async function lookupArtist(name: string): Promise<WikidataArtist | null> {
  const qid = await searchEntity(name);
  if (!qid) return null;
  const facts = await queryFacts(qid);
  return facts
    ? { qid, ...facts }
    : { qid, countryCode: null, languages: [], genreLabels: [] };
}

async function searchEntity(name: string): Promise<string | null> {
  const url = `${SEARCH_URL}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&uselang=en&type=item&limit=5&format=json&origin=*`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;
  const data = (await res.json()) as SearchResponse;

  for (const hit of data.search ?? []) {
    const description = (hit.description ?? '').toLowerCase();
    // An exact-ish label match plus a music-flavoured description is the bar for
    // accepting an entity; anything else is left alone rather than misattributed.
    const labelMatches = (hit.label ?? '').toLowerCase() === name.toLowerCase();
    if (labelMatches && MUSIC_HINTS.some((h) => description.includes(h))) return hit.id;
  }
  return null;
}

async function queryFacts(
  qid: string,
): Promise<{ countryCode: string | null; languages: string[]; genreLabels: string[] } | null> {
  // P136 genre labels are matched against the canonical MusicBrainz vocabulary
  // by the caller, so artists MusicBrainz never tagged still get genres.
  const sparql = `SELECT ?iso ?citizenIso ?lang ?genreLabel WHERE {
    VALUES ?a { wd:${qid} }
    OPTIONAL { ?a wdt:P495 ?origin . ?origin wdt:P297 ?iso . }
    OPTIONAL { ?a wdt:P27 ?citizen . ?citizen wdt:P297 ?citizenIso . }
    OPTIONAL { ?a wdt:P1412 ?language . ?language wdt:P218 ?lang . }
    OPTIONAL { ?a wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(lang(?genreLabel) = "en") }
  } LIMIT 60`;

  const res = await fetch(`${SPARQL_URL}?format=json&query=${encodeURIComponent(sparql)}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: { bindings?: Record<string, { value: string }>[] };
  };
  const rows = data.results?.bindings ?? [];
  if (rows.length === 0) return null;

  const origin = rows.find((r) => r.iso?.value)?.iso?.value ?? null;
  const citizen = rows.find((r) => r.citizenIso?.value)?.citizenIso?.value ?? null;
  const languages = [
    ...new Set(rows.map((r) => r.lang?.value).filter((v): v is string => Boolean(v))),
  ].filter((code) => !NON_SUNG_LANGUAGES.has(code));
  const genreLabels = [
    ...new Set(rows.map((r) => r.genreLabel?.value).filter((v): v is string => Boolean(v))),
  ];

  return { countryCode: origin ?? citizen, languages, genreLabels };
}
