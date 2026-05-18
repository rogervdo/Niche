/**
 * Fallback when GET /recommendations returns 404 (restricted for new Spotify apps).
 * Discovers music via related artists + each artist's top tracks.
 */
import { spotifyFetch } from '../spotify/api'
import type { PlaylistOptions } from './options'

const PLAYLIST_SIZE = 30

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
    if (candidates.length >= 100) break
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

async function getLiked(trackIds: string[]): Promise<boolean[]> {
  if (!trackIds.length) return []
  const chunks: boolean[] = []
  for (let i = 0; i < trackIds.length; i += 50) {
    const slice = trackIds.slice(i, i + 50)
    const part = await spotifyFetch<boolean[]>(
      `/me/tracks/contains?ids=${slice.join(',')}`
    )
    chunks.push(...part)
  }
  return chunks
}

/** Same priority order as discoverify getTracks, without recommendations API. */
export async function pickTracksViaRelatedArtists(
  seeds: { artists: string[]; tracks: string[] },
  options: PlaylistOptions,
  tracksInPlaylist: Set<string>,
  market: string
): Promise<string[]> {
  const seedArtists = await expandSeedsToArtists(seeds)
  if (!seedArtists.length) return []

  const candidates = await gatherCandidates(seedArtists, options, market)
  if (!candidates.length) return []

  const trackIds = candidates.map((t) => t.id)
  const liked = await getLiked(trackIds)

  const playlistUris = new Set<string>()
  const likedUris = new Set<string>()
  const inPlaylistUris = new Set<string>()

  for (let i = 0; i < candidates.length; i += 1) {
    const { uri, id } = candidates[i]!
    if (tracksInPlaylist.has(id)) inPlaylistUris.add(uri)
    if (!liked[i]) {
      playlistUris.add(uri)
    } else {
      likedUris.add(uri)
    }
    if (playlistUris.size >= PLAYLIST_SIZE) break
  }

  for (const uri of inPlaylistUris) {
    if (playlistUris.size >= PLAYLIST_SIZE) break
    if (!likedUris.has(uri)) playlistUris.add(uri)
  }

  for (const uri of likedUris) {
    if (playlistUris.size >= PLAYLIST_SIZE) break
    playlistUris.add(uri)
  }

  return Array.from(playlistUris)
}
