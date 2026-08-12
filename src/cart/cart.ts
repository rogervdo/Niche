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

function writeCart(tracks: CartEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks))
  } catch (err) {
    console.warn('[cart] localStorage write failed', err)
  }
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
  writeCart([...tracks, toCartEntry(track)])
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
