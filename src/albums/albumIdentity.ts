import type { SpotifyAlbumFull } from '../spotify/types'

export function albumYear(album: SpotifyAlbumFull): string {
  return album.release_date.slice(0, 4)
}

export function albumArtistLabel(album: SpotifyAlbumFull): string {
  return album.artists.map((a) => a.name).join(', ') || 'Unknown artist'
}
