const GENRE_ALIASES: Record<string, string[]> = {
  edm: [
    'edm',
    'electronic',
    'electronica',
    'house',
    'techno',
    'trance',
    'dance',
    'progressive house',
    'deep house',
    'electro',
  ],
  electronic: ['electronic', 'edm', 'electronica', 'house', 'techno'],
  house: ['house', 'deep house', 'progressive house', 'edm', 'electronic'],
  techno: ['techno', 'minimal techno', 'edm', 'electronic'],
  country: ['country', 'classic country', 'outlaw country', 'alt-country', 'americana'],
  'classic country': ['classic country', 'country', 'outlaw country', 'americana'],
  americana: ['americana', 'alt-country', 'country', 'classic country'],
  rock: ['rock', 'classic rock', 'indie rock', 'alternative rock', 'hard rock'],
  indie: ['indie', 'indie rock', 'indie pop', 'indie folk'],
  pop: ['pop', 'dance pop', 'indie pop', 'synthpop'],
  jazz: ['jazz', 'bebop', 'cool jazz', 'smooth jazz'],
  'hip hop': ['hip hop', 'rap', 'conscious hip hop', 'alternative hip hop'],
  rap: ['rap', 'hip hop', 'trap'],
  rnb: ['r&b', 'rnb', 'neo soul', 'soul'],
  soul: ['soul', 'neo soul', 'r&b'],
  metal: ['metal', 'heavy metal', 'death metal', 'black metal', 'metalcore'],
  punk: ['punk', 'pop punk', 'punk rock', 'post-punk'],
  folk: ['folk', 'indie folk', 'folk rock', 'americana'],
  blues: ['blues', 'blues rock', 'modern blues'],
  latin: ['latin', 'reggaeton', 'latin pop', 'salsa'],
  reggae: ['reggae', 'dub', 'roots reggae'],
  'j-rock': [
    'j-rock',
    'japanese rock',
    'j rock',
    'visual kei',
    'anime',
    'japanese indie',
    'japanese alternative',
    'math rock',
    'post-rock',
  ],
  'japanese rock': [
    'japanese rock',
    'j-rock',
    'visual kei',
    'anime',
    'japanese indie',
    'math rock',
  ],
  'visual kei': ['visual kei', 'j-rock', 'japanese rock', 'anime'],
  anime: ['anime', 'j-rock', 'japanese rock', 'visual kei'],
  'k-rock': ['k-rock', 'korean rock', 'k-indie', 'korean indie'],
  'korean rock': ['korean rock', 'k-rock', 'k-indie'],
}

/** Genres accepted by GET /recommendations seed_genres (subset of Spotify seeds). */
const RECOMMENDATION_SEED_GENRES = new Set([
  'acoustic',
  'afrobeat',
  'alt-rock',
  'alternative',
  'ambient',
  'anime',
  'black-metal',
  'bluegrass',
  'blues',
  'bossanova',
  'chill',
  'classical',
  'club',
  'comedy',
  'country',
  'dance',
  'dancehall',
  'death-metal',
  'deep-house',
  'disco',
  'drum-and-bass',
  'dub',
  'dubstep',
  'edm',
  'electro',
  'electronic',
  'emo',
  'folk',
  'funk',
  'garage',
  'gospel',
  'goth',
  'grunge',
  'guitar',
  'happy',
  'hard-rock',
  'hardcore',
  'hardstyle',
  'heavy-metal',
  'hip-hop',
  'house',
  'indie',
  'indie-pop',
  'industrial',
  'j-dance',
  'j-idol',
  'j-pop',
  'j-rock',
  'jazz',
  'k-pop',
  'latin',
  'latino',
  'malay',
  'metal',
  'metal-misc',
  'metalcore',
  'minimal-techno',
  'opera',
  'party',
  'piano',
  'pop',
  'punk',
  'punk-rock',
  'r-n-b',
  'reggae',
  'reggaeton',
  'rock',
  'rock-n-roll',
  'rockabilly',
  'salsa',
  'samba',
  'singer-songwriter',
  'ska',
  'soul',
  'spanish',
  'study',
  'summer',
  'synth-pop',
  'tango',
  'techno',
  'trance',
  'trip-hop',
  'world-music',
])

/** Map user/search terms to valid recommendation seed_genres values. */
export function recommendationSeedGenres(
  searchTerms: string[],
  configuredGenres: string[] = []
): string[] {
  const explicit = new Set(
    configuredGenres.map((g) => g.toLowerCase().trim()).filter(Boolean)
  )
  const seeds = new Set<string>()
  for (const raw of searchTerms) {
    const key = raw.toLowerCase().trim().replace(/\s+/g, '-')
    const rawKey = raw.toLowerCase().trim()
    if (RECOMMENDATION_SEED_GENRES.has(key)) {
      if (explicit.has(rawKey) || !BROAD_GENRE_MATCH_TAGS.has(rawKey)) {
        seeds.add(key)
      }
    }
    const aliases = GENRE_ALIASES[rawKey] ?? GENRE_ALIASES[key]
    if (aliases) {
      for (const alias of aliases) {
        const normalized = alias.replace(/\s+/g, '-')
        if (!RECOMMENDATION_SEED_GENRES.has(normalized)) continue
        if (explicit.has(alias) || !BROAD_GENRE_MATCH_TAGS.has(alias)) {
          seeds.add(normalized)
        }
      }
    }
  }
  return [...seeds].slice(0, 5)
}

export function expandGenreTargets(configured: string[]): string[] {
  const expanded = new Set<string>()
  for (const raw of configured) {
    const key = raw.toLowerCase().trim()
    if (!key) continue
    expanded.add(key)
    for (const alias of GENRE_ALIASES[key] ?? []) {
      expanded.add(alias)
    }
    if (!GENRE_ALIASES[key]) {
      for (const [canonical, aliases] of Object.entries(GENRE_ALIASES)) {
        if (aliases.includes(key) || canonical === key) {
          expanded.add(canonical)
          for (const a of aliases) expanded.add(a)
          continue
        }
        // Partial match (e.g. "house" → deep house) but not j-rock → rock
        if (
          key.length >= 4 &&
          aliases.some((a) => a.includes(key) && a !== key)
        ) {
          expanded.add(canonical)
          for (const a of aliases) expanded.add(a)
        }
      }
    }
  }
  return [...expanded]
}

/** Broad Spotify tags used for search but not overlap unless the user typed them. */
const BROAD_GENRE_MATCH_TAGS = new Set([
  'anime',
  'rock',
  'pop',
  'electronic',
  'alternative',
  'indie',
  'metal',
  'punk',
  'folk',
  'jazz',
  'hip hop',
  'rap',
  'post-rock',
])

/** Genre tags for scoring — tighter than {@link expandGenreTargets} (e.g. j-rock without bare anime). */
export function genreMatchTargets(configured: string[]): string[] {
  const explicit = new Set(
    configured.map((g) => g.toLowerCase().trim()).filter(Boolean)
  )
  return expandGenreTargets(configured).filter(
    (tag) => explicit.has(tag) || !BROAD_GENRE_MATCH_TAGS.has(tag)
  )
}

export function genreOverlapScore(
  artistGenres: string[],
  targets: string[]
): number {
  if (!targets.length) return 0
  const normalized = artistGenres.map((g) => g.toLowerCase())
  if (!normalized.length) return 0

  let hits = 0
  for (const target of targets) {
    const tokens = target.split(/\s+/).filter(Boolean)
    const matched = normalized.some(
      (g) =>
        g === target ||
        g.includes(target) ||
        target.includes(g) ||
        (tokens.length > 1 && tokens.every((t) => g.includes(t)))
    )
    if (matched) hits += 1
  }
  return hits
}

const MAX_GENRE_SEARCH_TERMS = 8

export function genreSearchTerms(configured: string[]): string[] {
  const terms: string[] = []
  const seen = new Set<string>()
  for (const raw of configured) {
    const key = raw.toLowerCase().trim()
    if (!key) continue
    const aliases = GENRE_ALIASES[key] ?? [key]
    for (const term of aliases) {
      if (terms.length >= MAX_GENRE_SEARCH_TERMS) return terms
      if (!seen.has(term)) {
        seen.add(term)
        terms.push(term)
      }
    }
  }
  return terms
}

export function genreSearchTermsFromTargets(targets: string[]): string[] {
  const terms: string[] = []
  const seen = new Set<string>()
  for (const raw of targets) {
    const key = raw.toLowerCase().trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    terms.push(key)
    if (terms.length >= MAX_GENRE_SEARCH_TERMS) break
  }
  return terms
}
