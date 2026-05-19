/**
 * Build a set of track IDs the user already knows: liked songs + every playlist.
 * Spotify has no single endpoint for "track in any playlist", so we paginate once
 * per generation and use O(1) Set lookups when filtering recommendations.
 */
import { spotifyFetch } from '../spotify/api'

const SAVED_TRACKS_FIELDS = 'items(track(id)),next'
const PLAYLIST_LIST_FIELDS = 'items(id),next'
const PLAYLIST_TRACKS_FIELDS = 'items(track(id)),next'
const PLAYLIST_FETCH_CONCURRENCY = 5

type SavedTracksPage = {
  items: { track: { id: string } | null }[]
  next: string | null
}

type PlaylistListPage = {
  items: ({ id: string } | null)[]
  next: string | null
}

type PlaylistTracksPage = {
  items: { track: { id: string } | null }[]
  next: string | null
}

function toApiPath(url: string): string {
  return url.startsWith('http')
    ? url.replace('https://api.spotify.com/v1', '')
    : url
}

async function paginateSavedTracks(ids: Set<string>): Promise<void> {
  let url: string | null = `/me/tracks?limit=50&fields=${SAVED_TRACKS_FIELDS}`
  while (url) {
    const path = toApiPath(url)
    const page: SavedTracksPage = await spotifyFetch<SavedTracksPage>(path)
    for (const item of page.items ?? []) {
      if (item.track?.id) ids.add(item.track.id)
    }
    url = page.next ? toApiPath(page.next) : null
  }
}

async function listPlaylistIds(): Promise<string[]> {
  const playlistIds: string[] = []
  let url: string | null = `/me/playlists?limit=50&fields=${PLAYLIST_LIST_FIELDS}`
  while (url) {
    const path = toApiPath(url)
    const page: PlaylistListPage = await spotifyFetch<PlaylistListPage>(path)
    for (const playlist of page.items ?? []) {
      if (playlist?.id) playlistIds.push(playlist.id)
    }
    url = page.next ? toApiPath(page.next) : null
  }
  return playlistIds
}

async function addPlaylistTracks(playlistId: string, ids: Set<string>): Promise<void> {
  let url: string | null =
    `/playlists/${playlistId}/tracks?limit=50&fields=${PLAYLIST_TRACKS_FIELDS}`
  while (url) {
    const path = toApiPath(url)
    const page: PlaylistTracksPage = await spotifyFetch<PlaylistTracksPage>(path)
    for (const item of page.items ?? []) {
      if (item.track?.id) ids.add(item.track.id)
    }
    url = page.next ? toApiPath(page.next) : null
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items]
  const workerCount = Math.min(limit, queue.length)
  if (!workerCount) return

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const item = queue.shift()!
        await fn(item)
      }
    })
  )
}

export async function fetchKnownTrackIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  await paginateSavedTracks(ids)
  const playlistIds = await listPlaylistIds()
  await mapWithConcurrency(playlistIds, PLAYLIST_FETCH_CONCURRENCY, (playlistId) =>
    addPlaylistTracks(playlistId, ids)
  )
  return ids
}
