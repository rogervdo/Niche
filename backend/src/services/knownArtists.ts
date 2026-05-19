/**
 * Artists to deprioritize (not hard-block): short + medium term tops only.
 * Full top-150 was excluding almost every related artist for heavy listeners.
 */
import { spotifyFetch } from './spotify.js'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type TimeRange = 'short_term' | 'medium_term'

const RANGES: TimeRange[] = ['short_term', 'medium_term']

export { CACHE_TTL_MS as KNOWN_ARTISTS_CACHE_TTL_MS }

async function getTopArtistIds(
  range: TimeRange,
  accessToken: string
): Promise<string[]> {
  const result = await spotifyFetch<{ items: { id: string }[] }>(
    `/me/top/artists?limit=25&time_range=${range}`,
    accessToken
  )
  return result.items.map((a) => a.id)
}

export async function fetchKnownArtistIds(
  accessToken: string
): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const range of RANGES) {
    const top = await getTopArtistIds(range, accessToken)
    for (const id of top) ids.add(id)
  }
  return ids
}
