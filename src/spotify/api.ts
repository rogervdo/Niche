import {
  clearAuth,
  getAccessToken,
  isInsufficientScopeMessage,
} from './auth'
import type {
  AudioFeatures,
  PlaylistTracksPage,
  PlaylistsPage,
  SearchTracksResponse,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUser,
} from './types'

const API_ROOT = 'https://api.spotify.com/v1'

const SCOPE_ERROR =
  'Insufficient permissions. Disconnect, then Connect with Spotify again and approve all requested access.'

function parseSpotifyError(status: number, body: unknown): string {
  const err = body as {
    error?: { message?: string; status?: number }
    error_description?: string
  }
  const message =
    err.error?.message ??
    err.error_description ??
    (typeof err.error === 'string' ? err.error : null) ??
    `Spotify API error (${status})`

  if (isInsufficientScopeMessage(message)) {
    clearAuth()
    return SCOPE_ERROR
  }
  return message
}

export async function spotifyFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken()
  const url = path.startsWith('http') ? path : `${API_ROOT}${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) {
    throw new Error('Session expired. Connect again.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(parseSpotifyError(res.status, err))
  }

  return res.json() as Promise<T>
}

export async function spotifyPut(path: string, body: unknown): Promise<void> {
  const token = await getAccessToken()
  const res = await fetch(`${API_ROOT}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (res.status === 401) {
    throw new Error('Session expired. Connect again.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(parseSpotifyError(res.status, err))
  }
}

export async function spotifyPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${API_ROOT}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (res.status === 401) {
    throw new Error('Session expired. Connect again.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(parseSpotifyError(res.status, err))
  }

  return res.json() as Promise<T>
}

export async function spotifyDelete(path: string, body: unknown): Promise<void> {
  const token = await getAccessToken()
  const res = await fetch(`${API_ROOT}${path}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (res.status === 401) {
    throw new Error('Session expired. Connect again.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(parseSpotifyError(res.status, err))
  }
}

/** Search tracks via Spotify field filters (e.g. track:"…" artist:"…"). */
export async function searchTracks(
  query: string,
  market?: string,
  limit = 50
): Promise<SpotifyTrack[]> {
  const marketParam = market ? `&market=${encodeURIComponent(market)}` : ''
  const res = await spotifyFetch<SearchTracksResponse>(
    `/search?type=track&q=${encodeURIComponent(query)}&limit=${limit}${marketParam}`
  )
  return (res.tracks?.items ?? []).filter((t) => t?.id)
}

export async function getCurrentUser(): Promise<SpotifyUser> {
  return spotifyFetch<SpotifyUser>('/me')
}

/** All playlists in your library (owned, followed, collaborative). Paginates like discoverify. */
export async function getAllPlaylists(): Promise<SpotifyPlaylist[]> {
  const all: SpotifyPlaylist[] = []
  let url: string | null = '/me/playlists?limit=50'

  while (url) {
    const path = url.startsWith('http')
      ? url.replace('https://api.spotify.com/v1', '')
      : url
    const page: PlaylistsPage = await spotifyFetch<PlaylistsPage>(path)
    const items = page.items ?? []
    all.push(...items.filter((p): p is SpotifyPlaylist => p != null))
    url = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null
  }

  return all
}

/** All tracks in a playlist (paginated). Skips removed/unavailable entries. */
export async function getPlaylistTracks(
  playlistId: string,
  market?: string
): Promise<SpotifyTrack[]> {
  const all: SpotifyTrack[] = []
  const marketParam = market ? `&market=${encodeURIComponent(market)}` : ''
  let url: string | null = `/playlists/${playlistId}/tracks?limit=50${marketParam}`

  while (url) {
    const path = url.startsWith('http')
      ? url.replace('https://api.spotify.com/v1', '')
      : url
    const page: PlaylistTracksPage = await spotifyFetch<PlaylistTracksPage>(path)
    const items = page.items ?? []
    for (const item of items) {
      if (item?.track?.id) all.push(item.track)
    }
    url = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null
  }

  return all
}

type AudioFeaturesResponse = {
  audio_features: (AudioFeatures | null)[]
}

/** Audio features for up to 100 track IDs per request; batches larger lists. */
export async function getAudioFeatures(
  trackIds: string[]
): Promise<Map<string, AudioFeatures>> {
  const map = new Map<string, AudioFeatures>()
  const unique = [...new Set(trackIds)]
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const ids = chunk.map(encodeURIComponent).join(',')
    const res = await spotifyFetch<AudioFeaturesResponse>(
      `/audio-features?ids=${ids}`
    )
    for (const feat of res.audio_features ?? []) {
      if (feat?.id) map.set(feat.id, feat)
    }
  }
  return map
}

export type PlaylistKind = 'yours' | 'collaborative' | 'followed'

export function classifyPlaylist(
  playlist: SpotifyPlaylist,
  userId: string
): PlaylistKind {
  if (playlist.owner?.id === userId) {
    return playlist.collaborative ? 'collaborative' : 'yours'
  }
  return 'followed'
}
