import { spotifyFetch } from './spotify.js'

const LIKED_SONGS_PLAYLIST_ID = '__niche_liked_songs__'

export type SpotifyPlaylist = {
  id: string
  name: string
  description: string | null
  public: boolean | null
  collaborative: boolean
  owner: { id: string; display_name: string | null } | null
  tracks: { total: number }
  images: { url: string; height: number | null; width: number | null }[] | null
  external_urls: { spotify: string }
}

export type SpotifyTrack = {
  id: string
  name: string
  duration_ms: number
  preview_url: string | null
  popularity?: number
  uri?: string
  linked_from?: { uri?: string; id?: string }
  artists: { id?: string; name: string }[]
  album: {
    id?: string
    name: string
    release_date?: string
    images: { url: string; width?: number | null; height?: number | null }[] | null
  }
  external_urls: { spotify: string }
}

export type PlaylistTrackEntry = {
  position: number
  uri: string
  track: SpotifyTrack
  addedAt?: string | null
}

type PlaylistsPage = {
  items: (SpotifyPlaylist | null)[] | null
  next: string | null
}

type PlaylistTrackItem = {
  track?: SpotifyTrack | null
  item?: SpotifyTrack | null
  is_local?: boolean
  added_at?: string | null
}

type PlaylistTracksPage = {
  items: (PlaylistTrackItem | null)[] | null
  next: string | null
}

type SavedTrackItem = {
  added_at: string
  track: SpotifyTrack | null
}

type SavedTracksPage = {
  items: SavedTrackItem[]
  next: string | null
}

function toApiPath(url: string): string {
  return url.startsWith('http')
    ? url.replace('https://api.spotify.com/v1', '')
    : url
}

function removeUriForPlaylistRow(
  track: SpotifyTrack,
  isLocal: boolean | undefined
): string | null {
  if (isLocal) return null
  if (track.linked_from?.uri) return track.linked_from.uri
  if (track.uri) return track.uri
  return track.id ? `spotify:track:${track.id}` : null
}

export async function fetchAllPlaylists(
  accessToken: string
): Promise<SpotifyPlaylist[]> {
  const all: SpotifyPlaylist[] = []
  let url: string | null = '/me/playlists?limit=50'

  while (url) {
    const path = toApiPath(url)
    const page: PlaylistsPage = await spotifyFetch<PlaylistsPage>(path, accessToken)
    all.push(...(page.items ?? []).filter((p): p is SpotifyPlaylist => p != null))
    url = page.next ? toApiPath(page.next) : null
  }

  return all
}

export async function fetchPlaylistTrackEntries(
  playlistId: string,
  accessToken: string,
  market: string
): Promise<PlaylistTrackEntry[]> {
  if (playlistId === LIKED_SONGS_PLAYLIST_ID) {
    return fetchLikedSongEntries(accessToken, market)
  }

  const entries: PlaylistTrackEntry[] = []
  const marketParam = market ? `&market=${encodeURIComponent(market)}` : ''
  let url: string | null = `/playlists/${playlistId}/items?limit=50${marketParam}`
  let position = 0

  while (url) {
    const path = toApiPath(url)
    const page: PlaylistTracksPage = await spotifyFetch<PlaylistTracksPage>(
      path,
      accessToken
    )
    for (const item of page.items ?? []) {
      if (!item) {
        position++
        continue
      }
      const track = item.track ?? item.item ?? null
      const uri = track?.id ? removeUriForPlaylistRow(track, item.is_local) : null
      if (track?.id && uri) {
        entries.push({
          position,
          uri,
          track,
          addedAt: item.added_at ?? null,
        })
      }
      position++
    }
    url = page.next ? toApiPath(page.next) : null
  }

  return entries
}

async function fetchLikedSongEntries(
  accessToken: string,
  market: string
): Promise<PlaylistTrackEntry[]> {
  const entries: PlaylistTrackEntry[] = []
  const marketParam = market ? `&market=${encodeURIComponent(market)}` : ''
  let url: string | null = `/me/tracks?limit=50${marketParam}`
  let position = 0

  while (url) {
    const path = toApiPath(url)
    const page: SavedTracksPage = await spotifyFetch<SavedTracksPage>(path, accessToken)
    for (const item of page.items ?? []) {
      const track = item.track
      if (track?.id) {
        entries.push({
          position,
          uri: track.uri ?? `spotify:track:${track.id}`,
          track,
          addedAt: item.added_at ?? null,
        })
      }
      position++
    }
    url = page.next ? toApiPath(page.next) : null
  }

  return entries
}

export { LIKED_SONGS_PLAYLIST_ID }
