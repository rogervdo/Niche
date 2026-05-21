import { Router } from 'express'
import {
  clearUserPlaylistCache,
  getCachedPlaylists,
  getCachedPlaylistTracks,
  invalidatePlaylistTracks,
  savePlaylistsToCache,
  savePlaylistTracksToCache,
} from '../services/playlistCacheService.js'
import {
  addTracksToLikedCache,
  getCachedLikedTrackIds,
  removeTracksFromLikedCache,
} from '../services/likedTracksCacheService.js'
import {
  enrichPlaylistEntries,
  getCachedAudioFeatures,
} from '../services/trackMetaCacheService.js'
import { SpotifyApiError, validateUser } from '../services/spotify.js'
import type { PlaylistTrackEntry, SpotifyPlaylist } from '../services/playlistLibrary.js'

export const cacheRouter = Router()

function cacheError(res: import('express').Response, err: unknown): void {
  const status = err instanceof SpotifyApiError ? err.status : 500
  const message = err instanceof Error ? err.message : 'Cache request failed'
  res.status(status).json({ error: message })
}

cacheRouter.post('/playlists', async (req, res) => {
  try {
    const { userId, accessToken, market = 'US', force = false } = req.body as {
      userId?: string
      accessToken?: string
      market?: string
      force?: boolean
    }

    if (!userId || !accessToken) {
      res.status(400).json({ error: 'userId and accessToken are required' })
      return
    }

    const result = await getCachedPlaylists(userId, accessToken, market, force)
    res.json(result)
  } catch (err) {
    cacheError(res, err)
  }
})

cacheRouter.put('/playlists', async (req, res) => {
  try {
    const { userId, accessToken, market = 'US', playlists } = req.body as {
      userId?: string
      accessToken?: string
      market?: string
      playlists?: SpotifyPlaylist[]
    }

    if (!userId || !accessToken || !Array.isArray(playlists)) {
      res.status(400).json({ error: 'userId, accessToken, and playlists are required' })
      return
    }

    await savePlaylistsToCache(userId, accessToken, market, playlists)
    res.json({ ok: true, fetchedAt: new Date().toISOString() })
  } catch (err) {
    cacheError(res, err)
  }
})

cacheRouter.post('/playlists/:playlistId/tracks', async (req, res) => {
  try {
    const { playlistId } = req.params
    const { userId, accessToken, market = 'US', force = false } = req.body as {
      userId?: string
      accessToken?: string
      market?: string
      force?: boolean
    }

    if (!userId || !accessToken) {
      res.status(400).json({ error: 'userId and accessToken are required' })
      return
    }

    const result = await getCachedPlaylistTracks(
      userId,
      accessToken,
      playlistId,
      market,
      force
    )
    res.json(result)
  } catch (err) {
    cacheError(res, err)
  }
})

cacheRouter.put('/playlists/:playlistId/tracks', async (req, res) => {
  try {
    const { playlistId } = req.params
    const { userId, accessToken, market = 'US', entries } = req.body as {
      userId?: string
      accessToken?: string
      market?: string
      entries?: PlaylistTrackEntry[]
    }

    if (!userId || !accessToken || !Array.isArray(entries)) {
      res
        .status(400)
        .json({ error: 'userId, accessToken, and entries are required' })
      return
    }

    await savePlaylistTracksToCache(userId, accessToken, playlistId, market, entries)
    res.json({ ok: true, fetchedAt: new Date().toISOString() })
  } catch (err) {
    cacheError(res, err)
  }
})

cacheRouter.delete('/', async (req, res) => {
  try {
    const { userId, accessToken } = req.body as {
      userId?: string
      accessToken?: string
    }

    if (!userId || !accessToken) {
      res.status(400).json({ error: 'userId and accessToken are required' })
      return
    }

    await clearUserPlaylistCache(userId, accessToken)
    res.json({ ok: true })
  } catch (err) {
    cacheError(res, err)
  }
})

cacheRouter.post('/tracks/enrich', async (req, res) => {
  try {
    const { userId, accessToken, market = 'US', entries } = req.body as {
      userId?: string
      accessToken?: string
      market?: string
      entries?: PlaylistTrackEntry[]
    }

    if (!userId || !accessToken || !Array.isArray(entries)) {
      res
        .status(400)
        .json({ error: 'userId, accessToken, and entries are required' })
      return
    }

    await validateUser(userId, accessToken)
    const enriched = await enrichPlaylistEntries(
      userId,
      accessToken,
      market,
      entries
    )
    res.json({ entries: enriched })
  } catch (err) {
    cacheError(res, err)
  }
})

cacheRouter.post('/liked-tracks', async (req, res) => {
  try {
    const { userId, accessToken, force = false } = req.body as {
      userId?: string
      accessToken?: string
      force?: boolean
    }

    if (!userId || !accessToken) {
      res.status(400).json({ error: 'userId and accessToken are required' })
      return
    }

    await validateUser(userId, accessToken)
    const result = await getCachedLikedTrackIds(userId, accessToken, force)
    res.json(result)
  } catch (err) {
    cacheError(res, err)
  }
})

cacheRouter.post('/liked-tracks/add', async (req, res) => {
  try {
    const { userId, accessToken, trackIds } = req.body as {
      userId?: string
      accessToken?: string
      trackIds?: string[]
    }

    if (!userId || !accessToken || !Array.isArray(trackIds)) {
      res
        .status(400)
        .json({ error: 'userId, accessToken, and trackIds are required' })
      return
    }

    await validateUser(userId, accessToken)
    await addTracksToLikedCache(userId, trackIds)
    res.json({ ok: true })
  } catch (err) {
    cacheError(res, err)
  }
})

cacheRouter.post('/liked-tracks/remove', async (req, res) => {
  try {
    const { userId, accessToken, trackIds } = req.body as {
      userId?: string
      accessToken?: string
      trackIds?: string[]
    }

    if (!userId || !accessToken || !Array.isArray(trackIds)) {
      res
        .status(400)
        .json({ error: 'userId, accessToken, and trackIds are required' })
      return
    }

    await validateUser(userId, accessToken)
    await removeTracksFromLikedCache(userId, trackIds)
    res.json({ ok: true })
  } catch (err) {
    cacheError(res, err)
  }
})

cacheRouter.post('/tracks/audio-features', async (req, res) => {
  try {
    const { userId, accessToken, trackIds } = req.body as {
      userId?: string
      accessToken?: string
      trackIds?: string[]
    }

    if (!userId || !accessToken || !Array.isArray(trackIds)) {
      res
        .status(400)
        .json({ error: 'userId, accessToken, and trackIds are required' })
      return
    }

    await validateUser(userId, accessToken)
    const features = await getCachedAudioFeatures(userId, accessToken, trackIds)
    res.json({ features })
  } catch (err) {
    cacheError(res, err)
  }
})

cacheRouter.delete('/playlists/:playlistId/tracks', async (req, res) => {
  try {
    const { playlistId } = req.params
    const { userId, accessToken, market = 'US' } = req.body as {
      userId?: string
      accessToken?: string
      market?: string
    }

    if (!userId || !accessToken) {
      res.status(400).json({ error: 'userId and accessToken are required' })
      return
    }

    await invalidatePlaylistTracks(userId, accessToken, playlistId, market)
    res.json({ ok: true })
  } catch (err) {
    cacheError(res, err)
  }
})
