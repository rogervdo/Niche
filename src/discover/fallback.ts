/**
 * Fallback when GET /recommendations returns 404 (restricted for new Spotify apps).
 * Discovers music via related artists + each artist's top tracks.
 */
import { spotifyFetch } from '../spotify/api'
import type { PlaylistOptions } from './options'

const PLAYLIST_SIZE = 30
const MAX_CANDIDATES = 200

export interface TrackCandidate {
  id: string
  uri: string
  popularity: number
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

async function getRelatedArtistIds(artistId: string): Promise<string[]> {
  const res = await spotifyFetch<{ artists: { id: string }[] }>(
    `/artists/${artistId}/related-artists`
  )
  return res.artists.map((a) => a.id)
}

async function getArtistTopTracks(
  artistId: string,
  market: string
): Promise<TrackCandidate[]> {
  const res = await spotifyFetch<{
    tracks: { id: string; uri: string; popularity: number }[]
  }>(`/artists/${artistId}/top-tracks?market=${market}`)
  return res.tracks.map((t) => ({
    id: t.id,
    uri: t.uri,
    popularity: t.popularity ?? 50,
  }))
}

async function getTrackPrimaryArtistId(trackId: string): Promise<string | null> {
  const track = await spotifyFetch<{ artists: { id: string }[] }>(
    `/tracks/${trackId}`
  )
  return track.artists[0]?.id ?? null
}

async function expandSeedsToArtists(
  seeds: { artists: string[]; tracks: string[] }
): Promise<string[]> {
  const ids = new Set<string>(seeds.artists)
  for (const trackId of seeds.tracks) {
    const artistId = await getTrackPrimaryArtistId(trackId)
    if (artistId) ids.add(artistId)
  }
  return [...ids]
}

async function gatherCandidates(
  seedArtistIds: string[],
  options: PlaylistOptions,
  market: string
): Promise<TrackCandidate[]> {
  const artistPool: string[] = []

  for (const seedId of seedArtistIds) {
    artistPool.push(seedId)
    try {
      const related = await getRelatedArtistIds(seedId)
      shuffle(related)
        .slice(0, 6)
        .forEach((id) => artistPool.push(id))
    } catch {
      // Related-artists can 404 for obscure IDs — skip
    }
  }

  const uniqueArtists = [...new Set(artistPool)]
  shuffle(uniqueArtists)

  const candidates: TrackCandidate[] = []
  const seen = new Set<string>()
  const [popMin, popMax] = options.popularity

  for (const artistId of uniqueArtists) {
    if (candidates.length >= MAX_CANDIDATES) break
    try {
      const tracks = shuffle(await getArtistTopTracks(artistId, market))
      for (const track of tracks.slice(0, 4)) {
        if (seen.has(track.id)) continue
        if (track.popularity < popMin || track.popularity > popMax) continue
        seen.add(track.id)
        candidates.push(track)
      }
    } catch {
      // Skip artists that fail (region, etc.)
    }
  }

  shuffle(candidates)
  return candidates
}

export async function pickTracksViaRelatedArtists(
  seeds: { artists: string[]; tracks: string[] },
  options: PlaylistOptions,
  knownTrackIds: Set<string>,
  market: string,
  alreadySelected: Set<string> = new Set()
): Promise<string[]> {
  const seedArtists = await expandSeedsToArtists(seeds)
  if (!seedArtists.length) return []

  const candidates = await gatherCandidates(seedArtists, options, market)
  if (!candidates.length) return []

  const remaining = PLAYLIST_SIZE - alreadySelected.size
  if (remaining <= 0) return []

  const playlistUris: string[] = []
  for (const { uri, id } of candidates) {
    if (knownTrackIds.has(id)) continue
    if (alreadySelected.has(uri)) continue
    playlistUris.push(uri)
    if (playlistUris.length >= remaining) break
  }

  return playlistUris
}
