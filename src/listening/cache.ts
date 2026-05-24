import type {
  RankedArtist,
  RankedGenre,
  RankedTrack,
  RecentPlay,
  TimeRange,
  TopCategory,
} from './statsApi'

const CACHE_TTL_MS = 30 * 60 * 1000
const RECENT_CACHE_TTL_MS = 5 * 60 * 1000
const STORAGE_PREFIX = 'niche_listening_'

type CacheEntry<T> = { at: number; data: T }

const memory = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

function ttlForKey(key: string): number {
  return key === 'recent' ? RECENT_CACHE_TTL_MS : CACHE_TTL_MS
}

function topKey(category: TopCategory, range: TimeRange): string {
  return `top_${category}_${range}`
}

function read<T>(key: string): T | null {
  const ttl = ttlForKey(key)
  const now = Date.now()

  const mem = memory.get(key)
  if (mem && now - mem.at < ttl) return mem.data as T

  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (now - entry.at >= ttl) return null
    memory.set(key, entry)
    return entry.data
  } catch {
    return null
  }
}

function write<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { at: Date.now(), data }
  memory.set(key, entry)
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry))
  } catch {
    /* quota — memory cache still works this session */
  }
}

async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = read<T>(key)
  if (hit) return hit

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const promise = fetcher()
    .then((data) => {
      write(key, data)
      return data
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

export function getCachedTopTracks(range: TimeRange, fetcher: () => Promise<RankedTrack[]>): Promise<RankedTrack[]> {
  return cachedFetch(topKey('tracks', range), fetcher)
}

export function getCachedTopArtists(
  range: TimeRange,
  fetcher: () => Promise<RankedArtist[]>
): Promise<RankedArtist[]> {
  return cachedFetch(topKey('artists', range), fetcher)
}

export function getCachedTopGenres(
  range: TimeRange,
  fetcher: () => Promise<RankedGenre[]>
): Promise<RankedGenre[]> {
  return cachedFetch(topKey('genres', range), fetcher)
}

export function getCachedRecentlyPlayed(
  fetcher: () => Promise<RecentPlay[]>
): Promise<RecentPlay[]> {
  return cachedFetch('recent', fetcher)
}

export function clearListeningCache(): void {
  memory.clear()
  inflight.clear()
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k?.startsWith(STORAGE_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}
