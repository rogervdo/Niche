import { addToCart, clearCart, getCartCount, getCartTrackIds, getCartUris, isInCart, removeFromCart } from './cart'
import type { SpotifyTrack } from '../spotify/types'

/** Minimal localStorage stand-in that enforces a character quota. */
class FakeStorage {
  private map = new Map<string, string>()

  constructor(private quota = Infinity) {}

  private used(): number {
    let total = 0
    for (const [key, value] of this.map) total += key.length + value.length
    return total
  }

  get length(): number {
    return this.map.size
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }

  setItem(key: string, value: string): void {
    const previous = this.map.get(key)
    const withoutKey = this.used() - (previous ? key.length + previous.length : 0)
    if (withoutKey + key.length + value.length > this.quota) {
      const error = new Error(`Setting the value of '${key}' exceeded the quota.`)
      error.name = 'QuotaExceededError'
      throw error
    }
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }
}

function useStorage(storage: FakeStorage): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
}

function makeTrack(index: number): SpotifyTrack {
  return {
    id: `track-${index}`,
    name: `Song ${index}`,
    duration_ms: 180_000 + index,
    preview_url: null,
    uri: `spotify:track:track-${index}`,
    artists: [{ name: `Artist ${index}` }],
    album: {
      name: `Album ${index}`,
      images: [{ url: `https://cdn/${index}.jpg`, width: 300, height: 300 }],
    },
    external_urls: { spotify: `https://open.spotify.com/track/track-${index}` },
  }
}

const originalStorage = globalThis.localStorage

afterEach(() => {
  jest.restoreAllMocks()
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalStorage,
    configurable: true,
    writable: true,
  })
})

describe('cart', () => {
  it('keeps adding tracks well past 10', () => {
    useStorage(new FakeStorage())

    for (let i = 0; i < 15; i++) {
      expect(addToCart(makeTrack(i))).toBe(true)
    }

    expect(getCartCount()).toBe(15)
    expect(getCartTrackIds()).toEqual(
      Array.from({ length: 15 }, (_, i) => `track-${i}`)
    )
  })

  it('does not report success when the cart cannot be persisted', () => {
    useStorage(new FakeStorage(50))
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    expect(addToCart(makeTrack(0))).toBe(false)
    expect(addToCart(makeTrack(1))).toBe(false)
    expect(getCartCount()).toBe(0)
  })

  it('evicts rebuildable caches instead of dropping the new track', () => {
    const storage = new FakeStorage(800)
    storage.setItem('niche_track_details_v1', 'a'.repeat(700))
    useStorage(storage)

    expect(addToCart(makeTrack(0))).toBe(true)
    expect(getCartCount()).toBe(1)
    expect(isInCart('track-0')).toBe(true)
    expect(storage.getItem('niche_track_details_v1')).toBeNull()
  })

  it('ignores duplicates and supports removal and clearing', () => {
    useStorage(new FakeStorage())

    expect(addToCart(makeTrack(1))).toBe(true)
    expect(addToCart(makeTrack(1))).toBe(false)
    expect(getCartUris()).toEqual(['spotify:track:track-1'])

    removeFromCart('track-1')
    expect(getCartCount()).toBe(0)

    addToCart(makeTrack(2))
    clearCart()
    expect(getCartCount()).toBe(0)
  })
})
