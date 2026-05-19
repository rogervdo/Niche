/** @deprecated Listening-history seeds — no longer used. */
export type SeedCode = 'AA' | 'MA' | 'SA' | 'AT' | 'MT' | 'ST'

export interface PlaylistOptions {
  /** @deprecated Ignored — use anchorArtistIds instead. */
  seeds?: SeedCode[]
  /** Optional anchor artists (Spotify ID or URL). We find related artists; anchors are not added to the playlist. */
  anchorArtistIds: string[]
  /** Playlist IDs or Spotify URLs — artists on these playlists are never added. */
  excludePlaylistIds: string[]
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
  excludePlaylistIds: [],
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
      excludePlaylistIds: [...DEFAULT_OPTIONS.excludePlaylistIds],
      genres: [...DEFAULT_OPTIONS.genres],
    }
  }
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    anchorArtistIds: options.anchorArtistIds?.length
      ? [...options.anchorArtistIds]
      : [...DEFAULT_OPTIONS.anchorArtistIds],
    excludePlaylistIds: options.excludePlaylistIds?.length
      ? [...options.excludePlaylistIds]
      : [...DEFAULT_OPTIONS.excludePlaylistIds],
    genres: options.genres?.length
      ? [...options.genres]
      : [...DEFAULT_OPTIONS.genres],
    artistPopularity: options.artistPopularity ?? DEFAULT_OPTIONS.artistPopularity,
    maxListeners: clampFollowerCap(
      options.maxListeners ?? DEFAULT_OPTIONS.maxListeners
    ),
  }
}

export function buildListenerCapSteps(): number[] {
  const steps: number[] = [0]
  for (let n = 1_000; n <= 10_000; n += 1_000) steps.push(n)
  for (let n = 15_000; n <= 50_000; n += 5_000) steps.push(n)
  for (let n = 60_000; n <= 100_000; n += 10_000) steps.push(n)
  for (let n = 125_000; n <= 250_000; n += 25_000) steps.push(n)
  for (let n = 300_000; n <= 1_000_000; n += 50_000) steps.push(n)
  for (const n of [
    1_250_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000,
  ]) {
    steps.push(n)
  }
  return steps
}

export const LISTENER_CAP_STEPS = buildListenerCapSteps()

export const MAX_FOLLOWER_CAP = 10_000_000

export function clampFollowerCap(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(Math.max(Math.round(value), 1_000), MAX_FOLLOWER_CAP)
}

export function listenerCapToSliderIndex(cap: number): number {
  const idx = LISTENER_CAP_STEPS.indexOf(cap)
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
