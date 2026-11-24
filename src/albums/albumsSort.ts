import { albumArtistLabel } from './albumIdentity'
import type { SavedAlbumItem } from '../spotify/types'

export type AlbumSortMode =
  | 'added_desc'
  | 'added_asc'
  | 'name'
  | 'name_desc'
  | 'artist'
  | 'year_desc'
  | 'year_asc'
  | 'tracks_desc'

export type AlbumTypeFilter = 'all' | 'album' | 'single' | 'compilation'

export const ALBUM_SORT_OPTIONS: { mode: AlbumSortMode; label: string }[] = [
  { mode: 'added_desc', label: 'Recently added' },
  { mode: 'added_asc', label: 'Oldest added' },
  { mode: 'name', label: 'Album (A–Z)' },
  { mode: 'name_desc', label: 'Album (Z–A)' },
  { mode: 'artist', label: 'Artist (A–Z)' },
  { mode: 'year_desc', label: 'Release year (newest)' },
  { mode: 'year_asc', label: 'Release year (oldest)' },
  { mode: 'tracks_desc', label: 'Most tracks' },
]

export function filterAlbums(
  items: SavedAlbumItem[],
  query: string,
  type: AlbumTypeFilter
): SavedAlbumItem[] {
  const q = query.trim().toLowerCase()
  return items.filter((item) => {
    if (type !== 'all' && item.album.album_type !== type) return false
    if (!q) return true
    if (item.album.name.toLowerCase().includes(q)) return true
    return item.album.artists.some((a) => a.name.toLowerCase().includes(q))
  })
}

function addedAtMs(item: SavedAlbumItem): number {
  const t = Date.parse(item.added_at)
  return Number.isFinite(t) ? t : 0
}

export function sortAlbums(
  items: SavedAlbumItem[],
  mode: AlbumSortMode
): SavedAlbumItem[] {
  const byName = (a: SavedAlbumItem, b: SavedAlbumItem): number =>
    a.album.name.localeCompare(b.album.name)

  const sorted = [...items]
  switch (mode) {
    case 'added_desc':
      sorted.sort((a, b) => addedAtMs(b) - addedAtMs(a) || byName(a, b))
      break
    case 'added_asc':
      sorted.sort((a, b) => addedAtMs(a) - addedAtMs(b) || byName(a, b))
      break
    case 'name':
      sorted.sort(byName)
      break
    case 'name_desc':
      sorted.sort((a, b) => byName(b, a))
      break
    case 'artist':
      sorted.sort(
        (a, b) =>
          albumArtistLabel(a.album).localeCompare(albumArtistLabel(b.album)) ||
          byName(a, b)
      )
      break
    case 'year_desc':
      sorted.sort(
        (a, b) =>
          b.album.release_date.localeCompare(a.album.release_date) || byName(a, b)
      )
      break
    case 'year_asc':
      sorted.sort(
        (a, b) =>
          a.album.release_date.localeCompare(b.album.release_date) || byName(a, b)
      )
      break
    case 'tracks_desc':
      sorted.sort(
        (a, b) => b.album.total_tracks - a.album.total_tracks || byName(a, b)
      )
      break
  }
  return sorted
}
