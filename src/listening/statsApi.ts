import { spotifyFetch } from '../spotify/api'
import type { SpotifyImage } from '../spotify/images'
import type { SpotifyTrack } from '../spotify/types'
import {
  getCachedRecentlyPlayed,
  getCachedTopArtists,
  getCachedTopGenres,
  getCachedTopTracks,
} from './cache'

export type TimeRange = 'short_term' | 'medium_term' | 'long_term'
export type TopCategory = 'tracks' | 'artists' | 'genres'

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  short_term: 'last 4 weeks',
  medium_term: 'last 6 months',
  long_term: 'last 12 months',
}

const LIMIT = 50

export type RankedTrack = {
  rank: number
  track: SpotifyTrack
}

export type RankedArtist = {
  rank: number
  id: string
  name: string
  images: SpotifyImage[] | null
  spotifyUrl: string
  genres: string[]
}

export type RankedGenre = {
  rank: number
  name: string
  score: number
}

export type RecentPlay = {
  rank: number
  track: SpotifyTrack
  playedAt: string
}

export async function fetchTopTracks(range: TimeRange): Promise<RankedTrack[]> {
  const res = await spotifyFetch<{ items: SpotifyTrack[] }>(
    `/me/top/tracks?limit=${LIMIT}&time_range=${range}`
  )
  return res.items.map((t, i) => ({ rank: i + 1, track: t }))
}

type TopArtistItem = {
  id: string
  name: string
  images: SpotifyImage[] | null
  genres: string[]
  external_urls: { spotify: string }
}

export async function fetchTopArtists(range: TimeRange): Promise<RankedArtist[]> {
  const res = await spotifyFetch<{ items: TopArtistItem[] }>(
    `/me/top/artists?limit=${LIMIT}&time_range=${range}`
  )
  return res.items.map((a, i) => ({
    rank: i + 1,
    id: a.id,
    name: a.name,
    images: a.images,
    spotifyUrl: a.external_urls.spotify,
    genres: a.genres,
  }))
}

export async function fetchTopGenres(range: TimeRange): Promise<RankedGenre[]> {
  const res = await spotifyFetch<{ items: TopArtistItem[] }>(
    `/me/top/artists?limit=${LIMIT}&time_range=${range}`
  )
  const scores = new Map<string, number>()
  res.items.forEach((artist, index) => {
    const weight = LIMIT - index
    for (const genre of artist.genres) {
      scores.set(genre, (scores.get(genre) ?? 0) + weight)
    }
  })
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMIT)
    .map(([name, score], i) => ({ rank: i + 1, name, score }))
}

type RecentlyPlayedPage = {
  items: { track: SpotifyTrack; played_at: string }[]
}

async function fetchRecentlyPlayedFromApi(): Promise<RecentPlay[]> {
  const res = await spotifyFetch<RecentlyPlayedPage>(
    '/me/player/recently-played?limit=50'
  )
  return res.items.map((item, i) => ({
    rank: i + 1,
    track: item.track,
    playedAt: item.played_at,
  }))
}

export async function fetchRecentlyPlayed(): Promise<RecentPlay[]> {
  return getCachedRecentlyPlayed(fetchRecentlyPlayedFromApi)
}

export async function fetchTopItems(
  category: TopCategory,
  range: TimeRange
): Promise<RankedTrack[] | RankedArtist[] | RankedGenre[]> {
  switch (category) {
    case 'tracks':
      return getCachedTopTracks(range, () => fetchTopTracks(range))
    case 'artists':
      return getCachedTopArtists(range, () => fetchTopArtists(range))
    case 'genres':
      return getCachedTopGenres(range, () => fetchTopGenres(range))
  }
}
