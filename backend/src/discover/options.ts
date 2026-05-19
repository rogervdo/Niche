/** @deprecated Listening-history seeds — no longer used. */
export type SeedCode = 'AA' | 'MA' | 'SA' | 'AT' | 'MT' | 'ST'

export interface PlaylistOptions {
  /** @deprecated Ignored — use anchorArtistIds instead. */
  seeds?: SeedCode[]
  /** Optional anchor artists (Spotify ID or URL). We find related artists; anchors are not added to the playlist. */
  anchorArtistIds: string[]
  /** Target genres; required unless anchor artists supply enough genre signal. */
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

export function mergeOptions(
  options?: Partial<PlaylistOptions>
): PlaylistOptions {
  if (!options) {
    return {
      ...DEFAULT_OPTIONS,
      anchorArtistIds: [...DEFAULT_OPTIONS.anchorArtistIds],
      genres: [...DEFAULT_OPTIONS.genres],
    }
  }
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    anchorArtistIds: options.anchorArtistIds?.length
      ? [...options.anchorArtistIds]
      : [...DEFAULT_OPTIONS.anchorArtistIds],
    genres: options.genres?.length
      ? [...options.genres]
      : [...DEFAULT_OPTIONS.genres],
    artistPopularity: options.artistPopularity ?? DEFAULT_OPTIONS.artistPopularity,
    maxListeners: options.maxListeners ?? DEFAULT_OPTIONS.maxListeners,
  }
}

/** Slider steps for maxListeners (followers). Index 0 = no cap. */
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
