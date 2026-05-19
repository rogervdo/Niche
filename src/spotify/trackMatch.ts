import type { SpotifyTrack } from './types'

/** Minimum composite score gain required before suggesting a replacement. */
export const MIN_SCORE_GAIN = 5

const VARIANT_SUFFIX =
  /\s*[\(\[](live|acoustic|karaoke|instrumental|commentary|demo|remix|mix|edit|version|cover|tribute|sped up|slowed|reprise).*[\)\]]/gi

/** Album names containing these are deprioritized vs standard studio releases. */
const ALBUM_PENALTY_RULES: { pattern: RegExp; penalty: number }[] = [
  { pattern: /\bsoundtrack\b/i, penalty: 55 },
  { pattern: /\bost\b/i, penalty: 50 },
  { pattern: /\boriginal motion picture\b/i, penalty: 50 },
  { pattern: /\bdeluxe\b/i, penalty: 45 },
  { pattern: /\bsuper deluxe\b/i, penalty: 50 },
  { pattern: /\bexpanded\b/i, penalty: 40 },
  { pattern: /\bcompilation\b/i, penalty: 45 },
  { pattern: /\bgreatest hits\b/i, penalty: 45 },
  { pattern: /\bbest of\b/i, penalty: 45 },
  { pattern: /\banniversary\b/i, penalty: 30 },
  { pattern: /\bcollector'?s?\b/i, penalty: 35 },
  { pattern: /\bbonus\b/i, penalty: 30 },
  { pattern: /\blive\b/i, penalty: 40 },
  { pattern: /\bacoustic\b/i, penalty: 35 },
  { pattern: /\bcommentary\b/i, penalty: 50 },
  { pattern: /\bcover versions?\b/i, penalty: 40 },
  { pattern: /\bre-?record(ed)?\b/i, penalty: 35 },
]

export function normalizeTrackTitle(name: string): string {
  return name
    .replace(VARIANT_SUFFIX, '')
    .replace(/\s*-\s*(remaster(ed)?|live|acoustic|radio edit).*$/i, '')
    .replace(/\s+feat\.?\s+.+$/i, '')
    .replace(/\s+ft\.?\s+.+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Strip edition markers so "Too Fast For Love (Deluxe Version)" → "too fast for love". */
export function normalizeAlbumName(name: string): string {
  return name
    .replace(
      /\s*[\(\[][^\)\]]*(deluxe|expanded|anniversary|remaster|bonus|edition|version|collector'?s?|super|live|soundtrack)[^\)\]]*[\)\]]/gi,
      ''
    )
    .replace(/\s*-\s*(deluxe|expanded|remaster(ed)?|anniversary|bonus edition).*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function albumEditionPenalty(albumName: string): number {
  let penalty = 0
  for (const { pattern, penalty: p } of ALBUM_PENALTY_RULES) {
    if (pattern.test(albumName)) penalty += p
  }
  return penalty
}

function primaryArtistName(track: SpotifyTrack): string {
  return track.artists[0]?.name?.toLowerCase() ?? ''
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTrackTitle(a)
  const nb = normalizeTrackTitle(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na.includes(nb) || nb.includes(na)
}

function albumCoreMatch(current: SpotifyTrack, candidate: SpotifyTrack): boolean {
  const a = normalizeAlbumName(current.album.name)
  const b = normalizeAlbumName(candidate.album.name)
  return Boolean(a && b && a === b)
}

function durationClose(a: SpotifyTrack, b: SpotifyTrack): boolean {
  const da = a.duration_ms
  const db = b.duration_ms
  if (!da || !db) return true
  const diff = Math.abs(da - db)
  return diff <= 30_000 || diff / Math.max(da, db) <= 0.15
}

/**
 * Composite score: popularity plus preference for standard studio editions.
 * Same-album non-deluxe beats a soundtrack even when the soundtrack has higher pop.
 */
export function scoreCandidate(
  current: SpotifyTrack,
  candidate: SpotifyTrack
): number {
  const pop = candidate.popularity ?? 0
  const candPenalty = albumEditionPenalty(candidate.album.name)
  const currPenalty = albumEditionPenalty(current.album.name)

  // Edition quality 0–100 (standard studio ≈ 100, deluxe/soundtrack much lower).
  const editionComponent = Math.max(0, 100 - candPenalty) * 0.35
  let score = pop + editionComponent

  if (albumCoreMatch(current, candidate) && candPenalty < currPenalty) {
    // Strong preference: standard release on the same album as a deluxe reissue.
    score += 40 + (currPenalty - candPenalty) * 0.4
  }

  if (currPenalty >= 30 && candPenalty === 0) {
    score += 15
  }

  return score
}

export type MatchResult =
  | { status: 'same' }
  | { status: 'none' }
  | { status: 'insufficient_gain'; candidate: SpotifyTrack }
  | { status: 'found'; candidate: SpotifyTrack }

/** Pick the best alternate recording: canonical album edition first, popularity second. */
export function findBestPopularityMatch(
  track: SpotifyTrack,
  candidates: SpotifyTrack[]
): MatchResult {
  const artist = primaryArtistName(track)
  if (!artist) return { status: 'none' }

  const currentScore = scoreCandidate(track, track)
  let best: SpotifyTrack | null = null
  let bestScore = currentScore

  for (const c of candidates) {
    if (c.id === track.id) continue
    if (primaryArtistName(c) !== artist) continue
    if (!titlesMatch(track.name, c.name)) continue
    if (!durationClose(track, c)) continue

    const score = scoreCandidate(track, c)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }

  if (!best) return { status: 'none' }
  if (best.id === track.id) return { status: 'same' }

  const gain = bestScore - currentScore
  if (gain < MIN_SCORE_GAIN) {
    return { status: 'insufficient_gain', candidate: best }
  }

  return { status: 'found', candidate: best }
}
