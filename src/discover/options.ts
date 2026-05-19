/** @deprecated Listening-history seeds — no longer used. */
export type SeedCode = 'AA' | 'MA' | 'SA' | 'AT' | 'MT' | 'ST'

export interface PlaylistOptions {
  seeds?: SeedCode[]
  anchorArtistIds: string[]
  genres: string[]
  artistPopularity: [number, number]
  /** Max Spotify followers (proxy for monthly listeners). 0 = no cap. */
  maxListeners: number
  acousticness: [number, number]
  danceability: [number, number]
  energy: [number, number]
  instrumentalness: [number, number]
  popularity: [number, number]
  valence: [number, number]
}

export const DEFAULT_OPTIONS: PlaylistOptions = {
  anchorArtistIds: [],
  genres: [],
  artistPopularity: [30, 60],
  maxListeners: 500_000,
  acousticness: [10, 90],
  danceability: [10, 90],
  energy: [10, 90],
  instrumentalness: [10, 90],
  popularity: [50, 100],
  valence: [10, 90],
}

export const LISTENER_CAP_STEPS = [
  0, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 750_000, 1_000_000,
  2_000_000, 5_000_000,
] as const

export function listenerCapToSliderIndex(cap: number): number {
  const idx = LISTENER_CAP_STEPS.indexOf(cap as (typeof LISTENER_CAP_STEPS)[number])
  if (idx >= 0) return idx
  let nearest = 0
  let best = Infinity
  for (let i = 0; i < LISTENER_CAP_STEPS.length; i += 1) {
    const step = LISTENER_CAP_STEPS[i]!
    const dist = Math.abs(step - cap)
    if (dist < best) {
      best = dist
      nearest = i
    }
  }
  return nearest
}

export function sliderIndexToListenerCap(index: number): number {
  const i = Math.max(0, Math.min(index, LISTENER_CAP_STEPS.length - 1))
  return LISTENER_CAP_STEPS[i]!
}

export function formatListenerCap(cap: number): string {
  if (cap === 0) return 'No limit'
  if (cap >= 1_000_000) {
    const m = cap / 1_000_000
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`
  }
  if (cap >= 1_000) return `${Math.round(cap / 1_000)}K`
  return cap.toLocaleString()
}

const OPTIONS_KEY = 'niche_discover_options'
const PLAYLIST_ID_KEY = 'niche_discover_playlist_id'

export function loadOptions(): PlaylistOptions {
  const raw = localStorage.getItem(OPTIONS_KEY)
  if (!raw) {
    return {
      ...DEFAULT_OPTIONS,
      anchorArtistIds: [...DEFAULT_OPTIONS.anchorArtistIds],
      genres: [...DEFAULT_OPTIONS.genres],
    }
  }
  try {
    const parsed = JSON.parse(raw) as PlaylistOptions & { seeds?: SeedCode[] }
    return {
      ...DEFAULT_OPTIONS,
      ...parsed,
      anchorArtistIds: parsed.anchorArtistIds?.length
        ? [...parsed.anchorArtistIds]
        : [...DEFAULT_OPTIONS.anchorArtistIds],
      genres: parsed.genres?.length ? [...parsed.genres] : [...DEFAULT_OPTIONS.genres],
      artistPopularity: parsed.artistPopularity ?? DEFAULT_OPTIONS.artistPopularity,
      maxListeners: parsed.maxListeners ?? DEFAULT_OPTIONS.maxListeners,
    }
  } catch {
    return {
      ...DEFAULT_OPTIONS,
      anchorArtistIds: [...DEFAULT_OPTIONS.anchorArtistIds],
      genres: [...DEFAULT_OPTIONS.genres],
    }
  }
}

export function saveOptions(options: PlaylistOptions): void {
  localStorage.setItem(OPTIONS_KEY, JSON.stringify(options))
}

export function loadDiscoverPlaylistId(): string | null {
  return localStorage.getItem(PLAYLIST_ID_KEY)
}

export function saveDiscoverPlaylistId(id: string): void {
  localStorage.setItem(PLAYLIST_ID_KEY, id)
}
