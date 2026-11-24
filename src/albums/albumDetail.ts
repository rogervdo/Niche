import { getAlbumTracksFull } from '../spotify/api'
import {
  getCachedPlaylistEntries,
  setCachedEntries,
} from '../spotify/playlistCache'
import { albumArtistLabel, albumYear } from './albumIdentity'
import type {
  PlaylistTrackEntry,
  SpotifyAlbumFull,
  SpotifyPlaylist,
  SpotifyTrack,
} from '../spotify/types'

const ALBUM_TYPE_LABELS: Record<SpotifyAlbumFull['album_type'], string> = {
  album: 'Album',
  single: 'Single',
  compilation: 'Compilation',
}

/** Synthetic playlist shaped from an album so the playlist detail view can render it. */
export function buildAlbumPlaylist(album: SpotifyAlbumFull): SpotifyPlaylist {
  return {
    id: album.id,
    name: album.name,
    description: `${ALBUM_TYPE_LABELS[album.album_type] ?? 'Album'} · ${albumYear(album)}`,
    public: null,
    collaborative: false,
    owner: {
      id: album.artists[0]?.id ?? '',
      display_name: albumArtistLabel(album),
    },
    tracks: { total: album.total_tracks },
    images:
      album.images?.map((img) => ({
        url: img.url,
        width: img.width ?? null,
        height: img.height ?? null,
      })) ?? null,
    external_urls: album.external_urls,
  }
}

function toEntries(tracks: SpotifyTrack[]): PlaylistTrackEntry[] {
  return tracks.map((track, position) => ({
    position,
    uri: track.uri ?? `spotify:track:${track.id}`,
    track,
    addedAt: null,
  }))
}

/** Album tracklist, served from the 24h cache when available. */
export async function getAlbumEntries(
  albumId: string,
  market: string
): Promise<PlaylistTrackEntry[]> {
  const cached = getCachedPlaylistEntries(albumId, market)
  if (cached) return cached
  return fetchAlbumEntries(albumId, market)
}

/** Force-fetch the album tracklist and update the cache. */
export async function fetchAlbumEntries(
  albumId: string,
  market: string
): Promise<PlaylistTrackEntry[]> {
  const entries = toEntries(await getAlbumTracksFull(albumId, market))
  setCachedEntries(albumId, market, entries)
  return entries
}
