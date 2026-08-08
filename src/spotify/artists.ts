import { spotifyFetch } from './api'

export interface SpotifyArtistFull {
  id: string
  name: string
  genres: string[]
  popularity: number
  followers: { total: number }
}

export async function batchGetArtists(ids: string[]): Promise<SpotifyArtistFull[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  const artists: SpotifyArtistFull[] = []
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50)
    const res = await spotifyFetch<{ artists: (SpotifyArtistFull | null)[] }>(
      `/artists?ids=${chunk.join(',')}`
    )
    for (const a of res.artists ?? []) {
      if (a?.id) artists.push(a)
    }
  }
  return artists
}
