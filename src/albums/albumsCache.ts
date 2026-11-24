import { PLAYLIST_CACHE_TTL_MS } from '../spotify/playlistCache'
import type { SavedAlbumItem } from '../spotify/types'

const SAVED_ALBUMS_KEY = 'niche_saved_albums_v1'

type SavedAlbumsEntry = { albums: SavedAlbumItem[]; fetchedAt: number }

function readEntry(): SavedAlbumsEntry | null {
  try {
    const raw = localStorage.getItem(SAVED_ALBUMS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedAlbumsEntry
  } catch {
    return null
  }
}

function writeEntry(entry: SavedAlbumsEntry): void {
  try {
    localStorage.setItem(SAVED_ALBUMS_KEY, JSON.stringify(entry))
  } catch {
    /* quota */
  }
}

export function getCachedSavedAlbums(): SavedAlbumItem[] | null {
  const entry = readEntry()
  if (!entry) return null
  if (Date.now() - entry.fetchedAt >= PLAYLIST_CACHE_TTL_MS) return null
  return entry.albums
}

export function setCachedSavedAlbums(albums: SavedAlbumItem[]): void {
  writeEntry({ albums, fetchedAt: Date.now() })
}

export function clearSavedAlbumsCache(): void {
  try {
    localStorage.removeItem(SAVED_ALBUMS_KEY)
  } catch {
    /* ignore */
  }
}
