import { spotifyFetch } from '../spotify/api'

type TimeRange = 'short_term' | 'medium_term'

const RANGES: TimeRange[] = ['short_term', 'medium_term']

async function getTopArtistIds(range: TimeRange): Promise<string[]> {
  const result = await spotifyFetch<{ items: { id: string }[] }>(
    `/me/top/artists?limit=25&time_range=${range}`
  )
  return result.items.map((a) => a.id)
}

export async function fetchKnownArtistIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const range of RANGES) {
    const top = await getTopArtistIds(range)
    for (const id of top) ids.add(id)
  }
  return ids
}
