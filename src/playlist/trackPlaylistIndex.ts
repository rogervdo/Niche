import { fetchPlaylistTracksFromCache } from '../api/playlistCache'
import { spotifyErrorMessage, spotifyFetch } from '../spotify/api'
import { filterOwnPlaylists } from './ownPlaylists'
import {
  getCachedPlaylistTrackIds,
  PLAYLIST_CACHE_TTL_MS,
  setCachedPlaylistTrackIds,
} from '../spotify/playlistCache'
import type { SpotifyPlaylist } from '../spotify/types'

const PLAYLIST_TRACKS_FIELDS = 'items(track(id)),next'
const FETCH_CONCURRENCY = 5
const TAG_INDEX_STORAGE_KEY = 'niche_playlist_tag_index_v2'

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
  const ids = filterOwnPlaylists(playlists, userId, archivedPlaylistIds)
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
  const stored: StoredTagIndex = {
    userId,
    market,
    fingerprint,
    fetchedAt: Date.now(),
    entries: [...index.entries()],
  }
  const payload = JSON.stringify(stored)
  try {
    localStorage.setItem(TAG_INDEX_STORAGE_KEY, payload)
  } catch {
    try {
      localStorage.removeItem('niche_cart_v1')
      localStorage.setItem(TAG_INDEX_STORAGE_KEY, payload)
    } catch {
      /* quota */
    }
  }
}

export function clearStoredTagIndex(): void {
  try {
    localStorage.removeItem(TAG_INDEX_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

let liveTagIndex: Map<string, PlaylistRef[]> | null = null
let onLiveTagIndexPatched: (() => void) | null = null

export function setLiveTagIndex(index: Map<string, PlaylistRef[]> | null): void {
  liveTagIndex = index
}

export function onTagIndexPatched(listener: (() => void) | null): void {
  onLiveTagIndexPatched = listener
}

/** Patch in-memory tags after tracks are added (avoids full re-scan). */
export function patchTagIndex(playlist: PlaylistRef, trackIds: string[]): void {
  if (!liveTagIndex || !trackIds.length) return

  for (const trackId of trackIds) {
    if (!trackId) continue
    const existing = liveTagIndex.get(trackId) ?? []
    if (existing.some((p) => p.id === playlist.id)) continue
    liveTagIndex.set(
      trackId,
      [...existing, playlist].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
    )
  }

  onLiveTagIndexPatched?.()
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
  market: string,
  userId?: string
): Promise<string[]> {
  const cached = getCachedPlaylistTrackIds(playlistId, market)
  if (cached) return cached

  if (userId) {
    const remote = await fetchPlaylistTracksFromCache(userId, playlistId, market, false)
    if (remote?.entries?.length) {
      const ids = remote.entries.map((e) => e.track.id).filter(Boolean)
      setCachedPlaylistTrackIds(playlistId, market, ids)
      return ids
    }
  }

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

/** Map track ID → your own playlists (not collaborative or followed) that contain it. */
export type TrackIndexBuildOptions = {
  /** Skip the stored index and rebuild from Spotify. */
  force?: boolean
  onProgress?: (done: number, total: number) => void
  onFailure?: (playlist: PlaylistRef, message: string) => void
}

export async function buildOwnPlaylistTrackIndex(
  playlists: SpotifyPlaylist[],
  userId: string,
  market: string,
  archivedPlaylistIds: ReadonlySet<string> = new Set(),
  options: TrackIndexBuildOptions = {}
): Promise<Map<string, PlaylistRef[]>> {
  const own = filterOwnPlaylists(playlists, userId, archivedPlaylistIds)

  const fingerprint = tagIndexFingerprint(playlists, userId, archivedPlaylistIds)
  if (!options.force) {
    const stored = loadStoredTagIndex(userId, market, fingerprint)
    if (stored) {
      options.onProgress?.(own.length, own.length)
      return stored
    }
  }

  const index = new Map<string, PlaylistRef[]>()
  const total = own.length
  let done = 0

  await mapWithConcurrency(own, FETCH_CONCURRENCY, async (playlist) => {
    const ref: PlaylistRef = { id: playlist.id, name: playlist.name }
    try {
      const trackIds = await fetchPlaylistTrackIds(playlist.id, market, userId)
      for (const trackId of trackIds) {
        const existing = index.get(trackId)
        if (existing) {
          if (!existing.some((p) => p.id === ref.id)) existing.push(ref)
        } else {
          index.set(trackId, [ref])
        }
      }
    } catch (err) {
      options.onFailure?.(ref, spotifyErrorMessage(err))
    } finally {
      done += 1
      options.onProgress?.(done, total)
    }
  })

  for (const refs of index.values()) {
    refs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }

  saveStoredTagIndex(userId, market, fingerprint, index)
  return index
}
