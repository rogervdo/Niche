import {
  isCacheFresh,
  PlaylistLibraryCache,
  PlaylistTracksCache,
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

export async function getCachedPlaylists(
  userId: string,
  accessToken: string,
  market: string,
  force = false
): Promise<{ playlists: SpotifyPlaylist[]; cached: boolean; fetchedAt: string }> {
  await validateUser(userId, accessToken)

  if (!force) {
    const doc = await PlaylistLibraryCache.findOne({ userId })
    if (doc && doc.market === market && isCacheFresh(doc.fetchedAt)) {
      return {
        playlists: doc.playlists as SpotifyPlaylist[],
        cached: true,
        fetchedAt: doc.fetchedAt.toISOString(),
      }
    }
  }

  const playlists = await fetchAllPlaylists(accessToken)
  const fetchedAt = new Date()

  await PlaylistLibraryCache.findOneAndUpdate(
    { userId },
    { userId, market, playlists, fetchedAt },
    { upsert: true, new: true }
  )

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

  if (!force) {
    const doc = await PlaylistTracksCache.findOne({ userId, playlistId, market })
    if (doc && isCacheFresh(doc.fetchedAt)) {
      const entries = await enrichPlaylistEntries(
        userId,
        accessToken,
        market,
        doc.entries as PlaylistTrackEntry[]
      )
      return {
        entries,
        cached: true,
        fetchedAt: doc.fetchedAt.toISOString(),
      }
    }
  }

  const raw = await fetchPlaylistTrackEntries(playlistId, accessToken, market)
  const entries = await enrichPlaylistEntries(userId, accessToken, market, raw)
  const fetchedAt = new Date()

  await PlaylistTracksCache.findOneAndUpdate(
    { userId, playlistId, market },
    { userId, playlistId, market, entries, fetchedAt },
    { upsert: true, new: true }
  )

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
  await PlaylistLibraryCache.findOneAndUpdate(
    { userId },
    { userId, market, playlists, fetchedAt: new Date() },
    { upsert: true, new: true }
  )
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
  await PlaylistTracksCache.findOneAndUpdate(
    { userId, playlistId, market },
    { userId, playlistId, market, entries: enriched, fetchedAt: new Date() },
    { upsert: true, new: true }
  )
}

export async function clearUserPlaylistCache(
  userId: string,
  accessToken: string
): Promise<void> {
  await validateUser(userId, accessToken)
  await Promise.all([
    PlaylistLibraryCache.deleteOne({ userId }),
    PlaylistTracksCache.deleteMany({ userId }),
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
  await PlaylistTracksCache.deleteOne({ userId, playlistId, market })
}
