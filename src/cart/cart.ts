import type { SpotifyTrack } from '../spotify/types'

const STORAGE_KEY = 'niche_cart_v2'

export interface CartEntry {
  id: string
  uri?: string
  linked_from?: { uri?: string }
  name: string
  duration_ms: number
  artists: { name: string }[]
  album: { images: { url: string; width?: number | null; height?: number | null }[] | null }
}

export function toCartEntry(track: SpotifyTrack): CartEntry {
  return {
    id: track.id,
    uri: track.uri,
    linked_from: track.linked_from ? { uri: track.linked_from.uri } : undefined,
    name: track.name,
    duration_ms: track.duration_ms,
    artists: track.artists.map((a) => ({ name: a.name })),
    album: { images: track.album.images },
  }
}

type Listener = () => void
const listeners = new Set<Listener>()

export function trackUri(track: CartEntry): string {
  if (track.linked_from?.uri) return track.linked_from.uri
  return track.uri ?? `spotify:track:${track.id}`
}

function readCart(): CartEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartEntry[]
    return Array.isArray(parsed) ? parsed.filter((t) => t?.id) : []
  } catch {
    return []
  }
}

/**
 * Rebuildable caches that share localStorage with the cart, largest first.
 * Evicted only when a cart write hits the storage quota.
 */
const EVICTABLE_CACHE_KEYS = [
  'niche_track_details_v1',
  'niche_audio_features_v1',
  'niche_preview_urls_v1',
  'niche_saved_albums_v1',
  'niche_playlist_tag_index_v2',
  'niche_playlist_track_ids_v1',
  'niche_liked_tracks_v1',
  'niche_tracks_cache_local_v1',
  'niche_cart_v1',
]

/** Persist the cart, evicting rebuildable caches if the quota is full. */
function writeCart(tracks: CartEntry[]): boolean {
  const payload = JSON.stringify(tracks)
  try {
    localStorage.setItem(STORAGE_KEY, payload)
    return true
  } catch {
    /* quota exceeded — free space below and retry */
  }

  for (const key of EVICTABLE_CACHE_KEYS) {
    try {
      if (localStorage.getItem(key) === null) continue
      localStorage.removeItem(key)
      localStorage.setItem(STORAGE_KEY, payload)
      return true
    } catch {
      continue
    }
  }

  console.warn('[cart] localStorage is full; cart write was not persisted')
  return false
}

function notify(): void {
  for (const fn of listeners) fn()
}

export function subscribeCart(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCartTracks(): CartEntry[] {
  return readCart()
}

export function getCartCount(): number {
  return readCart().length
}

export function isInCart(trackId: string): boolean {
  return readCart().some((t) => t.id === trackId)
}

export function addToCart(track: SpotifyTrack): boolean {
  const tracks = readCart()
  if (tracks.some((t) => t.id === track.id)) return false
  if (!writeCart([...tracks, toCartEntry(track)])) return false
  notify()
  return true
}

export function removeFromCart(trackId: string): void {
  const next = readCart().filter((t) => t.id !== trackId)
  if (next.length === readCart().length) return
  writeCart(next)
  notify()
}

export function clearCart(): void {
  if (!readCart().length) return
  writeCart([])
  notify()
}

export function getCartUris(): string[] {
  return readCart().map(trackUri)
}

export function getCartTrackIds(): string[] {
  return readCart().map((t) => t.id)
}
