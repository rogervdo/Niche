import { spotifyFetch } from '../spotify/api'

const CACHE_TTL_MS = 5 * 60 * 1000
const TOP_LIMIT = 15

type TimeRange = 'medium_term' | 'long_term'

export type TasteProfile = {
  artists: Record<TimeRange, { name: string }[]>
  tracks: Record<TimeRange, { name: string; artists: string }[]>
}

let cache: { at: number; data: TasteProfile } | null = null
let inflight: Promise<TasteProfile> | null = null

async function fetchTopArtists(range: TimeRange): Promise<{ name: string }[]> {
  const res = await spotifyFetch<{
    items: { name: string }[]
  }>(`/me/top/artists?limit=${TOP_LIMIT}&time_range=${range}`)
  return res.items.map((a) => ({ name: a.name }))
}

type TopTracksPage = {
  items: { name: string; artists: { name: string }[] }[]
}

async function fetchTopTracks(
  range: TimeRange
): Promise<{ name: string; artists: string }[]> {
  const res = await spotifyFetch<TopTracksPage>(
    `/me/top/tracks?limit=${TOP_LIMIT}&time_range=${range}`
  )
  return res.items.map((t) => ({
    name: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
  }))
}

async function loadTasteProfile(): Promise<TasteProfile> {
  const [mediumArtists, longArtists, mediumTracks, longTracks] = await Promise.all([
    fetchTopArtists('medium_term'),
    fetchTopArtists('long_term'),
    fetchTopTracks('medium_term'),
    fetchTopTracks('long_term'),
  ])

  return {
    artists: {
      medium_term: mediumArtists,
      long_term: longArtists,
    },
    tracks: {
      medium_term: mediumTracks,
      long_term: longTracks,
    },
  }
}

export async function getTasteProfile(): Promise<TasteProfile | null> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.data

  if (!inflight) {
    inflight = loadTasteProfile()
      .then((data) => {
        cache = { at: Date.now(), data }
        return data
      })
      .finally(() => {
        inflight = null
      })
  }

  try {
    return await inflight
  } catch {
    return cache?.data ?? null
  }
}

export function prefetchTasteProfile(): void {
  void getTasteProfile()
}

export function clearTasteProfileCache(): void {
  cache = null
  inflight = null
}

const RANGE_LABEL: Record<TimeRange, string> = {
  medium_term: 'last ~6 weeks',
  long_term: 'all time',
}

export function formatTasteProfile(profile: TasteProfile): string[] {
  const lines: string[] = ['Listening taste (Spotify top items):']

  for (const range of ['medium_term', 'long_term'] as const) {
    lines.push(`Top artists (${RANGE_LABEL[range]}):`)
    for (const a of profile.artists[range]) {
      lines.push(`  - ${a.name}`)
    }
    lines.push(`Top tracks (${RANGE_LABEL[range]}):`)
    for (const t of profile.tracks[range]) {
      lines.push(`  - ${t.name} — ${t.artists}`)
    }
  }

  return lines
}
