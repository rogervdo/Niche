import type { PlaylistTrackEntry, SpotifyPlaylist, SpotifyTrack } from './types'

const PLAYLISTS_KEY = 'niche_playlists_cache_v1'
const TRACKS_KEY = 'niche_tracks_cache_v1'

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
    fetchedAt: number
  }
}

let memoryPlaylists: PlaylistsCacheEntry | null = null
let memoryTracks: TracksCacheStore | null = null

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

function readTracksStore(): TracksCacheStore {
  if (memoryTracks) return memoryTracks
  try {
    const raw = sessionStorage.getItem(TRACKS_KEY)
    memoryTracks = raw ? (JSON.parse(raw) as TracksCacheStore) : {}
    return memoryTracks
  } catch {
    memoryTracks = {}
    return memoryTracks
  }
}

function writeTracksStore(store: TracksCacheStore): void {
  memoryTracks = store
  try {
    sessionStorage.setItem(TRACKS_KEY, JSON.stringify(store))
  } catch {
    /* quota or private mode */
  }
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
  const entry = readTracksStore()[tracksKey(playlistId, market)]
  if (!entry?.positions || entry.positions.length !== entry.tracks.length) {
    return null
  }
  return entry.tracks.map((track, i) => ({
    track,
    position: entry.positions[i]!,
    uri: track.uri ?? `spotify:track:${track.id}`,
  }))
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
    fetchedAt: Date.now(),
  }
  writeTracksStore(store)
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
  try {
    sessionStorage.removeItem(PLAYLISTS_KEY)
    sessionStorage.removeItem(TRACKS_KEY)
  } catch {
    /* ignore */
  }
}
