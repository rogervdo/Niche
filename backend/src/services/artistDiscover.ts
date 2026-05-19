/**
 * Genre-based niche artist discovery — new artists via genre search,
 * optionally branching from anchor artist IDs (not your listening history).
 */
import { parseAnchorArtistIds } from '../discover/anchors.js'
import {
  fetchArtistIdsFromPlaylists,
  parseExcludePlaylistIds,
} from '../discover/playlistExclude.js'
import type { PlaylistOptions } from '../discover/options.js'
import {
  expandGenreTargets,
  genreOverlapScore,
  genreSearchTerms,
  genreSearchTermsFromTargets,
  recommendationSeedGenres,
} from '../discover/genres.js'
import { spotifyFetch } from './spotify.js'

const PLAYLIST_SIZE = 30
const RELATED_PER_ANCHOR = 40
const SEARCH_LIMIT = 50
const SEARCH_PAGES = 2
const MAX_CANDIDATES = 500
const RANK_POOL_SHUFFLE = 100

export interface SpotifyArtistFull {
  id: string
  name: string
  genres: string[]
  popularity: number
  followers: { total: number }
}

interface ScoredArtist {
  id: string
  score: number
}

type RankMode = 'strict' | 'relaxed' | 'popularity-only'

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

export async function batchGetArtists(
  ids: string[],
  accessToken: string
): Promise<SpotifyArtistFull[]> {
  const unique = [...new Set(ids)]
  const artists: SpotifyArtistFull[] = []
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50)
    const res = await spotifyFetch<{ artists: (SpotifyArtistFull | null)[] }>(
      `/artists?ids=${chunk.join(',')}`,
      accessToken
    )
    for (const a of res.artists ?? []) {
      if (a?.id) artists.push(a)
    }
  }
  return artists
}

async function inferGenresFromTopArtists(
  accessToken: string
): Promise<string[]> {
  const result = await spotifyFetch<{ items: { id: string }[] }>(
    '/me/top/artists?limit=10&time_range=medium_term',
    accessToken
  )
  const ids = result.items.map((a) => a.id)
  if (!ids.length) return []
  const artists = await batchGetArtists(ids, accessToken)
  const counts = new Map<string, number>()
  for (const artist of artists) {
    for (const genre of artist.genres) {
      const key = genre.toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([g]) => g)
}

export function deriveTargetGenres(
  anchorArtists: SpotifyArtistFull[],
  configured: string[]
): string[] {
  if (configured.length) {
    return expandGenreTargets(configured)
  }
  const counts = new Map<string, number>()
  for (const artist of anchorArtists) {
    for (const genre of artist.genres) {
      const key = genre.toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([g]) => g)
}

function scoreArtist(
  artist: SpotifyArtistFull,
  targets: string[],
  [popMin, popMax]: [number, number],
  maxListeners: number,
  excludeIds: Set<string>,
  knownArtistIds: Set<string>,
  mode: RankMode
): number {
  if (excludeIds.has(artist.id)) return -1

  const pop = artist.popularity ?? 0
  if (pop < popMin || pop > popMax) return -1

  const followers = artist.followers?.total ?? 0
  if (maxListeners > 0 && followers > maxListeners) return -1

  const overlap = genreOverlapScore(artist.genres, targets)

  if (mode === 'strict' && targets.length && overlap === 0) return -1

  let score = 1

  if (overlap > 0) {
    score += overlap * 12
  } else if (mode === 'relaxed' && targets.length) {
    score += 2
  } else if (mode === 'popularity-only') {
    score += 1
  } else if (!targets.length) {
    score += 4
  }

  const mid = (popMin + popMax) / 2
  score += 8 - Math.abs(pop - mid) / 4

  if (maxListeners > 0 && followers >= 1_000) {
    score += 4 * (1 - followers / maxListeners)
  } else if (followers >= 1_000 && followers <= 500_000) {
    score += 4
  }

  if (artist.genres.length >= 2) score += 2

  if (knownArtistIds.has(artist.id)) score -= 15

  return score
}

async function getRelatedArtistIds(
  artistId: string,
  accessToken: string
): Promise<string[]> {
  const res = await spotifyFetch<{ artists: { id: string }[] }>(
    `/artists/${artistId}/related-artists`,
    accessToken
  )
  return res.artists.map((a) => a.id)
}

function randomSearchBaseOffset(): number {
  const steps = [0, 25, 50, 75, 100]
  return steps[Math.floor(Math.random() * steps.length)]!
}

async function searchArtistsByGenre(
  genre: string,
  baseOffset: number,
  accessToken: string
): Promise<string[]> {
  const ids: string[] = []
  const q = encodeURIComponent(`genre:"${genre}"`)
  for (let page = 0; page < SEARCH_PAGES; page += 1) {
    const offset = baseOffset + page * SEARCH_LIMIT
    if (offset > 950) break
    const res = await spotifyFetch<{
      artists?: { items: { id: string }[] }
    }>(
      `/search?q=${q}&type=artist&limit=${SEARCH_LIMIT}&offset=${offset}`,
      accessToken
    )
    const pageIds = (res.artists?.items ?? []).map((a) => a.id)
    if (!pageIds.length) break
    ids.push(...pageIds)
  }
  return ids
}

async function searchArtistsByKeyword(
  term: string,
  baseOffset: number,
  accessToken: string
): Promise<string[]> {
  const ids: string[] = []
  const q = encodeURIComponent(term)
  for (let page = 0; page < SEARCH_PAGES; page += 1) {
    const offset = baseOffset + page * SEARCH_LIMIT
    if (offset > 950) break
    const res = await spotifyFetch<{
      artists?: { items: { id: string }[] }
    }>(
      `/search?q=${q}&type=artist&limit=${SEARCH_LIMIT}&offset=${offset}`,
      accessToken
    )
    const pageIds = (res.artists?.items ?? []).map((a) => a.id)
    if (!pageIds.length) break
    ids.push(...pageIds)
  }
  return ids
}

async function gatherRecommendationArtistIds(
  searchGenres: string[],
  anchorIds: string[],
  popularity: [number, number],
  accessToken: string
): Promise<string[]> {
  const genreSeeds = recommendationSeedGenres(searchGenres)
  const artistSeeds = anchorIds.slice(0, 5)
  if (!genreSeeds.length && !artistSeeds.length) return []

  const [popMin, popMax] = popularity
  const ids = new Set<string>()

  const attempts: URLSearchParams[] = []
  if (genreSeeds.length && artistSeeds.length) {
    const p = new URLSearchParams({
      limit: '100',
      min_popularity: String(popMin),
      max_popularity: String(popMax),
    })
    p.set('seed_genres', genreSeeds.slice(0, 4).join(','))
    p.set('seed_artists', artistSeeds.slice(0, 1).join(','))
    attempts.push(p)
  }
  if (artistSeeds.length) {
    const p = new URLSearchParams({
      limit: '100',
      seed_artists: artistSeeds.slice(0, 5).join(','),
      min_popularity: String(popMin),
      max_popularity: String(popMax),
    })
    attempts.push(p)
  }
  if (genreSeeds.length) {
    const p = new URLSearchParams({
      limit: '100',
      seed_genres: genreSeeds.join(','),
      min_popularity: String(popMin),
      max_popularity: String(popMax),
    })
    attempts.push(p)
  }

  for (const params of attempts) {
    try {
      const res = await spotifyFetch<{
        tracks: { artists: { id: string }[] }[]
      }>(`/recommendations?${params}`, accessToken)
      for (const track of res.tracks ?? []) {
        for (const artist of track.artists ?? []) {
          if (artist.id) ids.add(artist.id)
        }
      }
      if (ids.size >= 40) break
    } catch {
      // try next seed combination
    }
  }

  return [...ids]
}

async function gatherCandidateArtistIds(
  anchorIds: string[],
  searchGenres: string[],
  popularity: [number, number],
  accessToken: string
): Promise<string[]> {
  const pool: string[] = []
  const searchOffset = randomSearchBaseOffset()
  const relatedLimit = anchorIds.length > 0 ? RELATED_PER_ANCHOR : 0

  for (const anchorId of anchorIds) {
    try {
      const related = await getRelatedArtistIds(anchorId, accessToken)
      shuffle(related)
        .slice(0, relatedLimit)
        .forEach((id) => pool.push(id))
    } catch {
      // skip invalid anchor
    }
  }

  for (const genre of searchGenres) {
    try {
      const found = await searchArtistsByGenre(
        genre,
        searchOffset,
        accessToken
      )
      pool.push(...found)
    } catch {
      // skip
    }
    try {
      const keyword = await searchArtistsByKeyword(
        genre,
        searchOffset,
        accessToken
      )
      pool.push(...keyword)
    } catch {
      // skip
    }
  }

  try {
    const recommended = await gatherRecommendationArtistIds(
      searchGenres,
      anchorIds,
      popularity,
      accessToken
    )
    pool.push(...recommended)
  } catch {
    // skip
  }

  return [...new Set(pool)].slice(0, MAX_CANDIDATES)
}

export function rankNicheArtists(
  candidates: SpotifyArtistFull[],
  targets: string[],
  popularity: [number, number],
  maxListeners: number,
  excludeIds: Set<string>,
  knownArtistIds: Set<string>,
  mode: RankMode
): ScoredArtist[] {
  const scored: ScoredArtist[] = []
  for (const artist of candidates) {
    const score = scoreArtist(
      artist,
      targets,
      popularity,
      maxListeners,
      excludeIds,
      knownArtistIds,
      mode
    )
    if (score > 0) scored.push({ id: artist.id, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored
}

async function getArtistTopTrackUri(
  artistId: string,
  market: string,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await spotifyFetch<{
      tracks: { uri: string; popularity: number }[]
    }>(`/artists/${artistId}/top-tracks?market=${market}`, accessToken)
    const tracks = res.tracks ?? []
    if (!tracks.length) return null
    const best = [...tracks].sort(
      (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)
    )[0]
    return best?.uri ?? null
  } catch {
    return null
  }
}

function diversifyRanked(ranked: ScoredArtist[]): ScoredArtist[] {
  const head = shuffle(ranked.slice(0, RANK_POOL_SHUFFLE))
  return [...head, ...ranked.slice(RANK_POOL_SHUFFLE)]
}

async function fillPlaylistFromRanked(
  ranked: ScoredArtist[],
  market: string,
  accessToken: string,
  limit: number,
  knownArtistIds: Set<string>,
  allowKnownArtists: boolean
): Promise<{ uris: string[]; artistCount: number }> {
  const uris: string[] = []
  const usedArtists = new Set<string>()

  for (const { id } of ranked) {
    if (uris.length >= limit) break
    if (usedArtists.has(id)) continue
    if (!allowKnownArtists && knownArtistIds.has(id)) continue
    const uri = await getArtistTopTrackUri(id, market, accessToken)
    if (!uri) continue
    usedArtists.add(id)
    uris.push(uri)
  }

  return { uris, artistCount: usedArtists.size }
}

export interface ArtistDiscoverResult {
  uris: string[]
  artistCount: number
  targetGenres: string[]
}

export async function pickPlaylistFromNicheArtists(
  options: PlaylistOptions,
  knownArtistIds: Set<string>,
  market: string,
  accessToken: string
): Promise<ArtistDiscoverResult> {
  const anchorIds = parseAnchorArtistIds(options.anchorArtistIds)
  const userSetGenres = options.genres.length > 0

  if (!userSetGenres && anchorIds.length === 0) {
    throw new Error(
      'Add at least one genre (e.g. country, edm) or anchor artist IDs to discover from.'
    )
  }

  const anchorDetails =
    anchorIds.length > 0 ? await batchGetArtists(anchorIds, accessToken) : []

  let targetGenres = deriveTargetGenres(anchorDetails, options.genres)
  if (!targetGenres.length && !userSetGenres) {
    targetGenres = await inferGenresFromTopArtists(accessToken)
  }
  if (!targetGenres.length) {
    throw new Error(
      'Could not determine genres. Enter genres (e.g. country, edm) or anchor artists that have genre tags on Spotify.'
    )
  }

  const searchGenres = userSetGenres
    ? genreSearchTerms(options.genres)
    : genreSearchTermsFromTargets(targetGenres)

  const excludePlaylistIds = parseExcludePlaylistIds(options.excludePlaylistIds)
  const playlistExcluded =
    excludePlaylistIds.length > 0
      ? await fetchArtistIdsFromPlaylists(
          excludePlaylistIds,
          accessToken,
          market
        )
      : new Set<string>()
  const excludeIds = new Set([...anchorIds, ...playlistExcluded])

  const candidateIds = await gatherCandidateArtistIds(
    anchorIds,
    searchGenres,
    options.artistPopularity,
    accessToken
  )
  const candidates = await batchGetArtists(candidateIds, accessToken)

  const modes: RankMode[] = userSetGenres
    ? ['strict', 'relaxed', 'popularity-only']
    : ['relaxed', 'popularity-only']

  let uris: string[] = []
  let artistCount = 0

  for (const mode of modes) {
    const ranked = diversifyRanked(
      rankNicheArtists(
        candidates,
        targetGenres,
        options.artistPopularity,
        options.maxListeners,
        excludeIds,
        knownArtistIds,
        mode
      )
    )
    const allowKnown = mode === 'popularity-only'
    const filled = await fillPlaylistFromRanked(
      ranked,
      market,
      accessToken,
      PLAYLIST_SIZE,
      knownArtistIds,
      allowKnown
    )
    if (filled.uris.length > uris.length) {
      uris = filled.uris
      artistCount = filled.artistCount
    }
    if (uris.length >= PLAYLIST_SIZE) break
  }

  if (!uris.length) {
    const withGenres = candidates.filter((a) => a.genres.length > 0).length
    throw new Error(
      `No new artists passed filters (${candidates.length} candidates, ${withGenres} with genre tags). ` +
        `Widen popularity, simplify genres (e.g. "country"), or add anchor artist IDs to branch from.`
    )
  }

  return {
    uris,
    artistCount,
    targetGenres: userSetGenres ? options.genres : targetGenres,
  }
}
