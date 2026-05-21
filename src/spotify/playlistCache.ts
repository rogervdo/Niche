import type { PlaylistTrackEntry, SpotifyPlaylist, SpotifyTrack } from './types'

import { clearLikedTracksCache } from './likedTracksCache'
import { clearTrackMetaCache } from './trackMetaCache'

const PLAYLISTS_KEY = 'niche_playlists_cache_v1'
const TRACKS_KEY = 'niche_tracks_cache_v1'
const TRACKS_LOCAL_KEY = 'niche_tracks_cache_local_v1'
const TRACK_IDS_KEY = 'niche_playlist_track_ids_v1'
export const PLAYLIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface PlaylistsCacheEntry {
  userId: string
  playlists: SpotifyPlaylist[]
  fetchedAt: number
}

interface TracksCacheStore {
  [key: string]: {
    tracks: SpotifyTrack[]
    /** Spotify playlist position per track (parallel to tracks). */
    positions: number[]
    /** ISO added_at per track (parallel to tracks). */
    addedAt?: (string | null)[]
    fetchedAt: number
  }
}

let memoryPlaylists: PlaylistsCacheEntry | null = null
let memoryTracks: TracksCacheStore | null = null
let memoryTrackIds: TrackIdsCacheStore | null = null

type TrackIdsCacheStore = {
  [key: string]: { trackIds: string[]; fetchedAt: number }
}

function tracksKey(playlistId: string, market: string): string {
  return `${playlistId}:${market}`
}

function readPlaylists(): PlaylistsCacheEntry | null {
  if (memoryPlaylists) return memoryPlaylists
  try {
    const raw = sessionStorage.getItem(PLAYLISTS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PlaylistsCacheEntry
    if (!parsed?.userId || !Array.isArray(parsed.playlists)) return null
    memoryPlaylists = parsed
    return parsed
  } catch {
    return null
  }
}

function writePlaylists(entry: PlaylistsCacheEntry): void {
  memoryPlaylists = entry
  try {
    sessionStorage.setItem(PLAYLISTS_KEY, JSON.stringify(entry))
  } catch {
    /* quota or private mode */
  }
}

function readTracksStoreFrom(storage: Storage, key: string): TracksCacheStore {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as TracksCacheStore) : {}
  } catch {
    return {}
  }
}

function readTracksStore(): TracksCacheStore {
  if (memoryTracks) return memoryTracks

  const session = readTracksStoreFrom(sessionStorage, TRACKS_KEY)
  const local = readTracksStoreFrom(localStorage, TRACKS_LOCAL_KEY)
  const merged: TracksCacheStore = { ...local }

  for (const [k, sessionEntry] of Object.entries(session)) {
    const localEntry = merged[k]
    if (!localEntry || sessionEntry.fetchedAt >= localEntry.fetchedAt) {
      merged[k] = sessionEntry
    }
  }

  memoryTracks = merged
  return merged
}

function writeTracksStore(store: TracksCacheStore): void {
  memoryTracks = store
  const payload = JSON.stringify(store)
  try {
    sessionStorage.setItem(TRACKS_KEY, payload)
  } catch {
    /* quota or private mode */
  }
  try {
    localStorage.setItem(TRACKS_LOCAL_KEY, payload)
  } catch {
    /* quota */
  }
}

function isTracksEntryFresh(
  entry: TracksCacheStore[string] | undefined
): boolean {
  return Boolean(entry && Date.now() - entry.fetchedAt < PLAYLIST_CACHE_TTL_MS)
}

export function getCachedPlaylists(userId: string): SpotifyPlaylist[] | null {
  const entry = readPlaylists()
  if (!entry || entry.userId !== userId) return null
  return entry.playlists
}

export function setCachedPlaylists(
  userId: string,
  playlists: SpotifyPlaylist[]
): void {
  writePlaylists({ userId, playlists, fetchedAt: Date.now() })
}

/** Upsert one playlist into the cached library list. */
export function upsertCachedPlaylist(playlist: SpotifyPlaylist, userId: string): void {
  const entry = readPlaylists()
  if (!entry || entry.userId !== userId) return
  const idx = entry.playlists.findIndex((p) => p.id === playlist.id)
  if (idx >= 0) entry.playlists[idx] = playlist
  else entry.playlists.unshift(playlist)
  writePlaylists(entry)
}

export function getCachedTracks(
  playlistId: string,
  market: string
): SpotifyTrack[] | null {
  const store = readTracksStore()
  return store[tracksKey(playlistId, market)]?.tracks ?? null
}

export function getCachedPlaylistEntries(
  playlistId: string,
  market: string
): PlaylistTrackEntry[] | null {
  const key = tracksKey(playlistId, market)
  const entry = readTracksStore()[key]
  if (!isTracksEntryFresh(entry)) return null
  if (!entry?.positions || entry.positions.length !== entry.tracks.length) {
    return null
  }
  return entry.tracks.map((track, i) => ({
    track,
    position: entry.positions[i]!,
    uri: track.uri ?? `spotify:track:${track.id}`,
    addedAt: entry.addedAt?.[i] ?? null,
  }))
}

function readTrackIdsStore(): TrackIdsCacheStore {
  if (memoryTrackIds) return memoryTrackIds
  try {
    const raw = localStorage.getItem(TRACK_IDS_KEY)
    memoryTrackIds = raw ? (JSON.parse(raw) as TrackIdsCacheStore) : {}
    return memoryTrackIds
  } catch {
    memoryTrackIds = {}
    return memoryTrackIds
  }
}

function writeTrackIdsStore(store: TrackIdsCacheStore): void {
  memoryTrackIds = store
  try {
    localStorage.setItem(TRACK_IDS_KEY, JSON.stringify(store))
  } catch {
    /* quota */
  }
}

export function getCachedPlaylistTrackIds(
  playlistId: string,
  market: string
): string[] | null {
  const entry = readTracksStore()[tracksKey(playlistId, market)]
  if (entry && Date.now() - entry.fetchedAt < PLAYLIST_CACHE_TTL_MS) {
    return entry.tracks.map((t) => t.id)
  }

  const idEntry = readTrackIdsStore()[tracksKey(playlistId, market)]
  if (idEntry && Date.now() - idEntry.fetchedAt < PLAYLIST_CACHE_TTL_MS) {
    return idEntry.trackIds
  }

  return null
}

export function setCachedPlaylistTrackIds(
  playlistId: string,
  market: string,
  trackIds: string[]
): void {
  const store = readTrackIdsStore()
  store[tracksKey(playlistId, market)] = {
    trackIds,
    fetchedAt: Date.now(),
  }
  writeTrackIdsStore(store)
}

export function setCachedEntries(
  playlistId: string,
  market: string,
  entries: PlaylistTrackEntry[]
): void {
  const store = readTracksStore()
  store[tracksKey(playlistId, market)] = {
    tracks: entries.map((e) => e.track),
    positions: entries.map((e) => e.position),
    addedAt: entries.map((e) => e.addedAt ?? null),
    fetchedAt: Date.now(),
  }
  writeTracksStore(store)
  setCachedPlaylistTrackIds(
    playlistId,
    market,
    entries.map((e) => e.track.id)
  )
}

export function setCachedTracks(
  playlistId: string,
  market: string,
  tracks: SpotifyTrack[]
): void {
  setCachedEntries(
    playlistId,
    market,
    tracks.map((track, position) => ({
      track,
      position,
      uri: track.uri ?? `spotify:track:${track.id}`,
    }))
  )
}

export function clearPlaylistCache(): void {
  memoryPlaylists = null
  memoryTracks = null
  memoryTrackIds = null
  clearTrackMetaCache()
  clearLikedTracksCache()
  try {
    sessionStorage.removeItem(PLAYLISTS_KEY)
    sessionStorage.removeItem(TRACKS_KEY)
    localStorage.removeItem(TRACKS_LOCAL_KEY)
    localStorage.removeItem(TRACK_IDS_KEY)
  } catch {
    /* ignore */
  }
}
