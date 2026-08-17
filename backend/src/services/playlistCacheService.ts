import {
  cacheDelete,
  cacheGet,
  cachePut,
  isCacheFresh,
} from '../db/models/playlistCache.js'
import {
  fetchAllPlaylists,
  fetchPlaylistTrackEntries,
  type PlaylistTrackEntry,
  type SpotifyPlaylist,
} from './playlistLibrary.js'
import { clearUserLikedTracksCache } from './likedTracksCacheService.js'
import {
  clearUserTrackMetaCache,
  enrichPlaylistEntries,
} from './trackMetaCacheService.js'
import { validateUser } from './spotify.js'

const KIND_LIBRARY = 'playlist_library'
const KIND_TRACKS = 'playlist_tracks'

function tracksKey(market: string, playlistId: string): string {
  return `${market}:${playlistId}`
}

export async function getCachedPlaylists(
  userId: string,
  accessToken: string,
  market: string,
  force = false
): Promise<{ playlists: SpotifyPlaylist[]; cached: boolean; fetchedAt: string }> {
  await validateUser(userId, accessToken)

  if (!force) {
    const entry = await cacheGet<SpotifyPlaylist[]>(userId, KIND_LIBRARY, market)
    if (entry && isCacheFresh(entry.fetchedAt)) {
      return {
        playlists: entry.payload,
        cached: true,
        fetchedAt: entry.fetchedAt.toISOString(),
      }
    }
  }

  const playlists = await fetchAllPlaylists(accessToken)
  const fetchedAt = new Date()

  await cachePut(userId, KIND_LIBRARY, market, playlists)

  return {
    playlists,
    cached: false,
    fetchedAt: fetchedAt.toISOString(),
  }
}

export async function getCachedPlaylistTracks(
  userId: string,
  accessToken: string,
  playlistId: string,
  market: string,
  force = false
): Promise<{
  entries: PlaylistTrackEntry[]
  cached: boolean
  fetchedAt: string
}> {
  await validateUser(userId, accessToken)

  const key = tracksKey(market, playlistId)

  if (!force) {
    const entry = await cacheGet<PlaylistTrackEntry[]>(userId, KIND_TRACKS, key)
    if (entry && isCacheFresh(entry.fetchedAt)) {
      const entries = await enrichPlaylistEntries(
        userId,
        accessToken,
        market,
        entry.payload
      )
      return {
        entries,
        cached: true,
        fetchedAt: entry.fetchedAt.toISOString(),
      }
    }
  }

  const raw = await fetchPlaylistTrackEntries(playlistId, accessToken, market)
  const entries = await enrichPlaylistEntries(userId, accessToken, market, raw)
  const fetchedAt = new Date()

  await cachePut(userId, KIND_TRACKS, key, entries)

  return {
    entries,
    cached: false,
    fetchedAt: fetchedAt.toISOString(),
  }
}

export async function savePlaylistsToCache(
  userId: string,
  accessToken: string,
  market: string,
  playlists: SpotifyPlaylist[]
): Promise<void> {
  await validateUser(userId, accessToken)
  await cachePut(userId, KIND_LIBRARY, market, playlists)
}

export async function savePlaylistTracksToCache(
  userId: string,
  accessToken: string,
  playlistId: string,
  market: string,
  entries: PlaylistTrackEntry[]
): Promise<void> {
  await validateUser(userId, accessToken)
  const enriched = await enrichPlaylistEntries(
    userId,
    accessToken,
    market,
    entries
  )
  await cachePut(userId, KIND_TRACKS, tracksKey(market, playlistId), enriched)
}

export async function clearUserPlaylistCache(
  userId: string,
  accessToken: string
): Promise<void> {
  await validateUser(userId, accessToken)
  await Promise.all([
    cacheDelete(userId, KIND_LIBRARY),
    cacheDelete(userId, KIND_TRACKS),
    clearUserTrackMetaCache(userId),
    clearUserLikedTracksCache(userId),
  ])
}

export async function invalidatePlaylistTracks(
  userId: string,
  accessToken: string,
  playlistId: string,
  market: string
): Promise<void> {
  await validateUser(userId, accessToken)
  await cacheDelete(userId, KIND_TRACKS, tracksKey(market, playlistId))
}
