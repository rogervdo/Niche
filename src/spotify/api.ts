import { getAccessToken } from './auth'
import type {
  PlaylistTracksPage,
  PlaylistsPage,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUser,
} from './types'

async function spotifyFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) {
    throw new Error('Session expired. Connect again.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ??
        `Spotify API error (${res.status})`
    )
  }

  return res.json() as Promise<T>
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
  playlistId: string
): Promise<SpotifyTrack[]> {
  const all: SpotifyTrack[] = []
  let url: string | null = `/playlists/${playlistId}/tracks?limit=50`

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
