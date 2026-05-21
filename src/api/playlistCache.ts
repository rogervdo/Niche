import type { PlaylistTrackEntry, SpotifyPlaylist } from '../spotify/types'
import { isBackendAvailable } from './client'
import { getAccessToken } from '../spotify/auth'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

let backendCacheEnabled: boolean | null = null

export async function isPlaylistCacheApiEnabled(): Promise<boolean> {
  if (backendCacheEnabled === null) {
    backendCacheEnabled = await isBackendAvailable()
  }
  return backendCacheEnabled
}

export function resetPlaylistCacheApiProbe(): void {
  backendCacheEnabled = null
}

async function cacheFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `Cache API error (${res.status})`)
  }
  return data
}

export async function fetchPlaylistsFromCache(
  userId: string,
  market: string,
  force = false
): Promise<{ playlists: SpotifyPlaylist[]; cached: boolean } | null> {
  if (!(await isPlaylistCacheApiEnabled())) return null
  try {
    const accessToken = await getAccessToken()
    const data = await cacheFetch<{
      playlists: SpotifyPlaylist[]
      cached: boolean
    }>('/api/cache/playlists', {
      method: 'POST',
      body: JSON.stringify({ userId, accessToken, market, force }),
    })
    return { playlists: data.playlists, cached: data.cached }
  } catch {
    return null
  }
}

export async function savePlaylistsToRemoteCache(
  userId: string,
  market: string,
  playlists: SpotifyPlaylist[]
): Promise<void> {
  if (!(await isPlaylistCacheApiEnabled())) return
  try {
    const accessToken = await getAccessToken()
    await cacheFetch('/api/cache/playlists', {
      method: 'PUT',
      body: JSON.stringify({ userId, accessToken, market, playlists }),
    })
  } catch {
    /* local cache still works */
  }
}

export async function fetchPlaylistTracksFromCache(
  userId: string,
  playlistId: string,
  market: string,
  force = false
): Promise<{ entries: PlaylistTrackEntry[]; cached: boolean } | null> {
  if (!(await isPlaylistCacheApiEnabled())) return null
  try {
    const accessToken = await getAccessToken()
    const data = await cacheFetch<{
      entries: PlaylistTrackEntry[]
      cached: boolean
    }>(`/api/cache/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ userId, accessToken, market, force }),
    })
    return { entries: data.entries, cached: data.cached }
  } catch {
    return null
  }
}

export async function savePlaylistTracksToRemoteCache(
  userId: string,
  playlistId: string,
  market: string,
  entries: PlaylistTrackEntry[]
): Promise<void> {
  if (!(await isPlaylistCacheApiEnabled())) return
  try {
    const accessToken = await getAccessToken()
    await cacheFetch(`/api/cache/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'PUT',
      body: JSON.stringify({ userId, accessToken, market, entries }),
    })
  } catch {
    /* ignore */
  }
}

export async function clearRemotePlaylistCache(userId: string): Promise<void> {
  if (!(await isPlaylistCacheApiEnabled())) return
  try {
    const accessToken = await getAccessToken()
    await cacheFetch('/api/cache', {
      method: 'DELETE',
      body: JSON.stringify({ userId, accessToken }),
    })
  } catch {
    /* ignore */
  }
}

export async function enrichEntriesFromRemoteCache(
  userId: string,
  market: string,
  entries: PlaylistTrackEntry[]
): Promise<PlaylistTrackEntry[] | null> {
  if (!(await isPlaylistCacheApiEnabled())) return null
  try {
    const accessToken = await getAccessToken()
    const data = await cacheFetch<{ entries: PlaylistTrackEntry[] }>(
      '/api/cache/tracks/enrich',
      {
        method: 'POST',
        body: JSON.stringify({ userId, accessToken, market, entries }),
      }
    )
    return data.entries
  } catch {
    return null
  }
}

export async function fetchAudioFeaturesFromRemoteCache(
  userId: string,
  trackIds: string[]
): Promise<Map<string, import('../spotify/types').AudioFeatures> | null> {
  if (!(await isPlaylistCacheApiEnabled())) return null
  try {
    const accessToken = await getAccessToken()
    const data = await cacheFetch<{
      features: Record<string, import('../spotify/types').AudioFeatures>
    }>('/api/cache/tracks/audio-features', {
      method: 'POST',
      body: JSON.stringify({ userId, accessToken, trackIds }),
    })
    return new Map(Object.entries(data.features))
  } catch {
    return null
  }
}

export async function fetchLikedTrackIdsFromRemoteCache(
  userId: string,
  force = false
): Promise<{ trackIds: string[]; cached: boolean } | null> {
  if (!(await isPlaylistCacheApiEnabled())) return null
  try {
    const accessToken = await getAccessToken()
    const data = await cacheFetch<{
      trackIds: string[]
      cached: boolean
    }>('/api/cache/liked-tracks', {
      method: 'POST',
      body: JSON.stringify({ userId, accessToken, force }),
    })
    return { trackIds: data.trackIds, cached: data.cached }
  } catch {
    return null
  }
}

export async function addTracksToRemoteLikedCache(
  userId: string,
  trackIds: string[]
): Promise<void> {
  if (!(await isPlaylistCacheApiEnabled()) || !trackIds.length) return
  try {
    const accessToken = await getAccessToken()
    await cacheFetch('/api/cache/liked-tracks/add', {
      method: 'POST',
      body: JSON.stringify({ userId, accessToken, trackIds }),
    })
  } catch {
    /* ignore */
  }
}

export async function invalidateRemotePlaylistTracks(
  userId: string,
  playlistId: string,
  market: string
): Promise<void> {
  if (!(await isPlaylistCacheApiEnabled())) return
  try {
    const accessToken = await getAccessToken()
    await cacheFetch(
      `/api/cache/playlists/${encodeURIComponent(playlistId)}/tracks`,
      {
        method: 'DELETE',
        body: JSON.stringify({ userId, accessToken, market }),
      }
    )
  } catch {
    /* ignore */
  }
}
