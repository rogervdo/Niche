import type { SpotifyTrack } from '../spotify/types'

const STORAGE_KEY = 'niche_cart_v1'

type Listener = () => void
const listeners = new Set<Listener>()

export function trackUri(track: SpotifyTrack): string {
  if (track.linked_from?.uri) return track.linked_from.uri
  return track.uri ?? `spotify:track:${track.id}`
}

function readCart(): SpotifyTrack[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SpotifyTrack[]
    return Array.isArray(parsed) ? parsed.filter((t) => t?.id) : []
  } catch {
    return []
  }
}

function writeCart(tracks: SpotifyTrack[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks))
  } catch {
    /* quota or private mode */
  }
}

function notify(): void {
  for (const fn of listeners) fn()
}

export function subscribeCart(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCartTracks(): SpotifyTrack[] {
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
  writeCart([...tracks, track])
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
