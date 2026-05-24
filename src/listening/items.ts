import type { SpotifyImage } from '../spotify/images'
import type { SpotifyTrack } from '../spotify/types'
import type { RankedArtist, RankedGenre, RankedTrack, RecentPlay } from './statsApi'

export type ListeningItemKind = 'track' | 'artist' | 'genre'

export type ListeningItem = {
  id: string
  rank: number
  kind: ListeningItemKind
  name: string
  subtitle: string
  images: SpotifyImage[] | null
  spotifyUrl: string | null
  playedAt?: string
  track?: SpotifyTrack
  popularity?: number
  genres?: string[]
  /** Weight from top-artist genre aggregation (genres view). */
  genreScore?: number
}

export function trackItemFromRanked(item: RankedTrack): ListeningItem | null {
  const t = item.track
  if (!t?.id) return null
  return {
    id: t.id,
    rank: item.rank,
    kind: 'track',
    name: t.name,
    subtitle: `${t.artists.map((a) => a.name).join(', ')} · ${t.album.name}`,
    images: t.album.images,
    spotifyUrl: t.external_urls.spotify,
    track: t,
    popularity: t.popularity,
  }
}

export function trackItemFromRecent(item: RecentPlay): ListeningItem {
  const t = item.track
  return {
    id: t.id,
    rank: item.rank,
    kind: 'track',
    name: t.name,
    subtitle: `${t.artists.map((a) => a.name).join(', ')} · ${t.album.name}`,
    images: t.album.images,
    spotifyUrl: t.external_urls.spotify,
    playedAt: item.playedAt,
    track: t,
    popularity: t.popularity,
  }
}

export function artistItem(item: RankedArtist): ListeningItem {
  return {
    id: item.id,
    rank: item.rank,
    kind: 'artist',
    name: item.name,
    subtitle: item.genres?.length ? item.genres.slice(0, 3).join(', ') : 'Artist',
    images: item.images,
    spotifyUrl: item.spotifyUrl,
    genres: item.genres,
  }
}

export function genreItem(item: RankedGenre): ListeningItem {
  return {
    id: `genre-${item.rank}-${item.name}`,
    rank: item.rank,
    kind: 'genre',
    name: item.name,
    subtitle: 'Genre',
    images: null,
    spotifyUrl: null,
    genreScore: item.score,
  }
}
