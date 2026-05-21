import { classifyPlaylist, spotifyFetch } from '../spotify/api'
import {
  getCachedPlaylistTrackIds,
  PLAYLIST_CACHE_TTL_MS,
  setCachedPlaylistTrackIds,
} from '../spotify/playlistCache'
import type { SpotifyPlaylist } from '../spotify/types'

const PLAYLIST_TRACKS_FIELDS = 'items(track(id)),next'
const FETCH_CONCURRENCY = 5
const TAG_INDEX_STORAGE_KEY = 'niche_playlist_tag_index_v1'

export type PlaylistRef = { id: string; name: string }

type PlaylistTracksPage = {
  items: { track: { id: string } | null }[]
  next: string | null
}

type StoredTagIndex = {
  userId: string
  market: string
  fingerprint: string
  fetchedAt: number
  entries: [string, PlaylistRef[]][]
}

function toApiPath(url: string): string {
  return url.startsWith('http')
    ? url.replace('https://api.spotify.com/v1', '')
    : url
}

function tagIndexFingerprint(
  playlists: SpotifyPlaylist[],
  userId: string,
  archivedPlaylistIds: ReadonlySet<string>
): string {
  const ids = playlists
    .filter((p) => {
      if (archivedPlaylistIds.has(p.id)) return false
      const kind = classifyPlaylist(p, userId)
      return kind === 'yours' || kind === 'collaborative'
    })
    .map((p) => p.id)
    .sort()
  const archived = [...archivedPlaylistIds].sort().join(',')
  return `${ids.join(',')}|arch:${archived}`
}

function loadStoredTagIndex(
  userId: string,
  market: string,
  fingerprint: string
): Map<string, PlaylistRef[]> | null {
  try {
    const raw = localStorage.getItem(TAG_INDEX_STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredTagIndex
    if (
      stored.userId !== userId ||
      stored.market !== market ||
      stored.fingerprint !== fingerprint ||
      Date.now() - stored.fetchedAt >= PLAYLIST_CACHE_TTL_MS
    ) {
      return null
    }
    return new Map(stored.entries)
  } catch {
    return null
  }
}

function saveStoredTagIndex(
  userId: string,
  market: string,
  fingerprint: string,
  index: Map<string, PlaylistRef[]>
): void {
  try {
    const stored: StoredTagIndex = {
      userId,
      market,
      fingerprint,
      fetchedAt: Date.now(),
      entries: [...index.entries()],
    }
    localStorage.setItem(TAG_INDEX_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    /* quota */
  }
}

export function clearStoredTagIndex(): void {
  try {
    localStorage.removeItem(TAG_INDEX_STORAGE_KEY)
  } catch {
    /* ignore */
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

async function fetchPlaylistTrackIds(
  playlistId: string,
  market: string
): Promise<string[]> {
  const cached = getCachedPlaylistTrackIds(playlistId, market)
  if (cached) return cached

  const ids: string[] = []
  const marketParam = market ? `&market=${encodeURIComponent(market)}` : ''
  let url: string | null =
    `/playlists/${playlistId}/items?limit=50&fields=${PLAYLIST_TRACKS_FIELDS}${marketParam}`

  while (url) {
    const path = toApiPath(url)
    const page: PlaylistTracksPage = await spotifyFetch<PlaylistTracksPage>(path)
    for (const item of page.items ?? []) {
      if (item.track?.id) ids.push(item.track.id)
    }
    url = page.next ? toApiPath(page.next) : null
  }

  setCachedPlaylistTrackIds(playlistId, market, ids)
  return ids
}

/** Map track ID → playlists you own (yours + collaborative) that contain it. */
export async function buildOwnPlaylistTrackIndex(
  playlists: SpotifyPlaylist[],
  userId: string,
  market: string,
  archivedPlaylistIds: ReadonlySet<string> = new Set()
): Promise<Map<string, PlaylistRef[]>> {
  const own = playlists.filter((p) => {
    if (archivedPlaylistIds.has(p.id)) return false
    const kind = classifyPlaylist(p, userId)
    return kind === 'yours' || kind === 'collaborative'
  })

  const fingerprint = tagIndexFingerprint(playlists, userId, archivedPlaylistIds)
  const stored = loadStoredTagIndex(userId, market, fingerprint)
  if (stored) return stored

  const index = new Map<string, PlaylistRef[]>()

  await mapWithConcurrency(own, FETCH_CONCURRENCY, async (playlist) => {
    const trackIds = await fetchPlaylistTrackIds(playlist.id, market)
    const ref: PlaylistRef = { id: playlist.id, name: playlist.name }
    for (const trackId of trackIds) {
      const existing = index.get(trackId)
      if (existing) {
        if (!existing.some((p) => p.id === ref.id)) existing.push(ref)
      } else {
        index.set(trackId, [ref])
      }
    }
  })

  for (const refs of index.values()) {
    refs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }

  saveStoredTagIndex(userId, market, fingerprint, index)
  return index
}
