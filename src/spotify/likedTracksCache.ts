import { PLAYLIST_CACHE_TTL_MS } from './playlistCache'

const LIKED_TRACKS_KEY = 'niche_liked_tracks_v1'

type LikedTracksEntry = { trackIds: string[]; fetchedAt: number }

function readEntry(): LikedTracksEntry | null {
  try {
    const raw = localStorage.getItem(LIKED_TRACKS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LikedTracksEntry
  } catch {
    return null
  }
}

function writeEntry(entry: LikedTracksEntry): void {
  try {
    localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(entry))
  } catch {
    /* quota */
  }
}

function isFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < PLAYLIST_CACHE_TTL_MS
}

export function getCachedLikedTrackIds(): Set<string> | null {
  const entry = readEntry()
  if (!entry || !isFresh(entry.fetchedAt)) return null
  return new Set(entry.trackIds)
}

export function setCachedLikedTrackIds(trackIds: string[]): void {
  writeEntry({ trackIds, fetchedAt: Date.now() })
}

export function addToLikedTrackIdsCache(trackIds: string[]): void {
  const entry = readEntry()
  const set = new Set(entry?.trackIds ?? [])
  for (const id of trackIds) set.add(id)
  writeEntry({ trackIds: [...set], fetchedAt: Date.now() })
}

export function clearLikedTracksCache(): void {
  try {
    localStorage.removeItem(LIKED_TRACKS_KEY)
  } catch {
    /* ignore */
  }
}
