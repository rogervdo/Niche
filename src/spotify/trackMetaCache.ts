import type { AudioFeatures, SpotifyTrack } from './types'
import { PLAYLIST_CACHE_TTL_MS } from './playlistCache'

const TRACK_DETAILS_KEY = 'niche_track_details_v1'
const AUDIO_FEATURES_KEY = 'niche_audio_features_v1'
const PREVIEW_URLS_KEY = 'niche_preview_urls_v1'

type Timestamped<T> = { value: T; fetchedAt: number }

function isFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < PLAYLIST_CACHE_TTL_MS
}

function readStore<T>(key: string): Record<string, Timestamped<T>> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Record<string, Timestamped<T>>) : {}
  } catch {
    return {}
  }
}

function writeStore<T>(key: string, store: Record<string, Timestamped<T>>): void {
  try {
    localStorage.setItem(key, JSON.stringify(store))
  } catch {
    /* quota */
  }
}

export function getCachedTrackDetails(ids: string[]): Map<string, SpotifyTrack> {
  const store = readStore<SpotifyTrack>(TRACK_DETAILS_KEY)
  const map = new Map<string, SpotifyTrack>()
  for (const id of ids) {
    const entry = store[id]
    if (entry && isFresh(entry.fetchedAt)) map.set(id, entry.value)
  }
  return map
}

export function setCachedTrackDetails(tracks: SpotifyTrack[]): void {
  if (!tracks.length) return
  const store = readStore<SpotifyTrack>(TRACK_DETAILS_KEY)
  const now = Date.now()
  for (const track of tracks) {
    if (!track.id) continue
    store[track.id] = { value: track, fetchedAt: now }
  }
  writeStore(TRACK_DETAILS_KEY, store)
}

export function getCachedAudioFeaturesMap(
  trackIds: string[]
): Map<string, AudioFeatures> {
  const store = readStore<AudioFeatures>(AUDIO_FEATURES_KEY)
  const map = new Map<string, AudioFeatures>()
  for (const id of trackIds) {
    const entry = store[id]
    if (entry && isFresh(entry.fetchedAt)) map.set(id, entry.value)
  }
  return map
}

export function setCachedAudioFeatures(features: Iterable<AudioFeatures>): void {
  const store = readStore<AudioFeatures>(AUDIO_FEATURES_KEY)
  const now = Date.now()
  for (const feat of features) {
    if (!feat.id) continue
    store[feat.id] = { value: feat, fetchedAt: now }
  }
  writeStore(AUDIO_FEATURES_KEY, store)
}

/** `undefined` = not cached. Only successful URLs are persisted. */
export function getCachedPreviewUrl(trackId: string): string | null | undefined {
  const entry = readStore<string | null>(PREVIEW_URLS_KEY)[trackId]
  if (!entry || !isFresh(entry.fetchedAt) || entry.value == null) return undefined
  return entry.value
}

export function setCachedPreviewUrl(trackId: string, url: string | null): void {
  const store = readStore<string | null>(PREVIEW_URLS_KEY)
  store[trackId] = { value: url, fetchedAt: Date.now() }
  writeStore(PREVIEW_URLS_KEY, store)
}

export function clearTrackMetaCache(): void {
  try {
    localStorage.removeItem(TRACK_DETAILS_KEY)
    localStorage.removeItem(AUDIO_FEATURES_KEY)
    localStorage.removeItem(PREVIEW_URLS_KEY)
  } catch {
    /* ignore */
  }
}
