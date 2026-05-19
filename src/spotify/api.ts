import {
  clearAuth,
  getAccessToken,
  isInsufficientScopeMessage,
} from './auth'
import { playlistDebug } from './playlistDebug'
import type {
  AudioFeatures,
  PlaylistTracksPage,
  PlaylistsPage,
  SearchTracksResponse,
  PlaylistTrackEntry,
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
  const raw =
    err.error?.message ??
    err.error_description ??
    (typeof err.error === 'string' ? err.error : null)

  let message = raw ?? `Spotify API error (${status})`

  if (status === 429) {
    message =
      raw && /rate|limit|too many/i.test(raw)
        ? raw
        : 'Spotify API rate limit exceeded. Please wait a minute and try again.'
  } else if (status === 403 && !raw) {
    message =
      'Spotify denied this request. You may not have permission to edit this playlist.'
  } else if (status >= 500 && !raw) {
    message = 'Spotify is temporarily unavailable. Please try again shortly.'
  }

  if (isInsufficientScopeMessage(message)) {
    clearAuth()
    return SCOPE_ERROR
  }
  return message
}

/** User-facing message from a failed Spotify API call. */
export function spotifyErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
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

export async function spotifyPut<T = { snapshot_id?: string }>(
  path: string,
  body: unknown
): Promise<T | undefined> {
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

  const text = await res.text()
  if (!text) return undefined
  return JSON.parse(text) as T
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

export async function spotifyDelete<T = { snapshot_id?: string }>(
  path: string,
  body: unknown
): Promise<T | undefined> {
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

  const text = await res.text()
  if (!text) return undefined
  return JSON.parse(text) as T
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

/** URI Spotify expects when removing this playlist row (may differ from track.uri). */
function removeUriForPlaylistRow(
  track: SpotifyTrack,
  isLocal: boolean | undefined
): string | null {
  if (isLocal) return null
  if (track.linked_from?.uri) return track.linked_from.uri
  if (track.uri) return track.uri
  return track.id ? `spotify:track:${track.id}` : null
}

/** All playlist rows with position and URI (for accurate remove). */
export async function getPlaylistTrackEntries(
  playlistId: string,
  market?: string
): Promise<PlaylistTrackEntry[]> {
  const entries: PlaylistTrackEntry[] = []
  const marketParam = market ? `&market=${encodeURIComponent(market)}` : ''
  let url: string | null = `/playlists/${playlistId}/items?limit=50${marketParam}`
  let position = 0
  let spotifyTotal = 0
  let linkedFromCount = 0

  while (url) {
    const path = url.startsWith('http')
      ? url.replace('https://api.spotify.com/v1', '')
      : url
    const page: PlaylistTracksPage = await spotifyFetch<PlaylistTracksPage>(path)
    spotifyTotal = page.total ?? spotifyTotal
    for (const item of page.items ?? []) {
      if (!item) {
        position++
        continue
      }
      const track = item.track ?? item.item ?? null
      const uri = track?.id ? removeUriForPlaylistRow(track, item.is_local) : null
      if (track?.id && uri) {
        if (
          track.linked_from?.uri &&
          track.uri &&
          track.linked_from.uri !== track.uri
        ) {
          linkedFromCount++
        }
        entries.push({ position, uri, track })
      }
      position++
    }
    url = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null
  }

  const lastPosition = entries.length ? entries[entries.length - 1]!.position : -1
  const skippedSlots =
    entries.length > 0 ? lastPosition + 1 - entries.length : 0

  playlistDebug('getPlaylistTrackEntries', {
    playlistId,
    playableCount: entries.length,
    spotifyTotal,
    lastPlaylistPosition: lastPosition,
    skippedSlots,
    totalMinusPlayable: spotifyTotal - entries.length,
    linkedFromCount,
  })

  return entries
}

/** All tracks in a playlist (paginated). Skips removed/unavailable entries. */
export async function getPlaylistTracks(
  playlistId: string,
  market?: string
): Promise<SpotifyTrack[]> {
  const entries = await getPlaylistTrackEntries(playlistId, market)
  return entries.map((e) => e.track)
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
