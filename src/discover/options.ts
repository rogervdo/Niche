/** @deprecated Listening-history seeds — no longer used. */
export type SeedCode = 'AA' | 'MA' | 'SA' | 'AT' | 'MT' | 'ST'

export interface PlaylistOptions {
  seeds?: SeedCode[]
  anchorArtistIds: string[]
  /** Playlist IDs or Spotify URLs — artists on these playlists are never added. */
  excludePlaylistIds: string[]
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

/** Follower-cap slider steps (index 0 = no cap). Dense below 250K for niche tuning. */
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

/** 0 = no cap. Otherwise clamped to [1_000, MAX_FOLLOWER_CAP]. */
export function clampFollowerCap(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(Math.max(Math.round(value), 1_000), MAX_FOLLOWER_CAP)
}

export function parseFollowerCapInput(raw: string): number {
  const trimmed = raw.trim().toLowerCase().replace(/,/g, '')
  if (!trimmed) return 0
  const k = trimmed.match(/^([\d.]+)k$/)
  if (k) return clampFollowerCap(Number(k[1]) * 1_000)
  const m = trimmed.match(/^([\d.]+)m$/)
  if (m) return clampFollowerCap(Number(m[1]) * 1_000_000)
  const n = Number(trimmed)
  return Number.isFinite(n) ? clampFollowerCap(n) : 0
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

const OPTIONS_KEY = 'niche_discover_options'
const PLAYLIST_ID_KEY = 'niche_discover_playlist_id'

export function loadOptions(): PlaylistOptions {
  const raw = localStorage.getItem(OPTIONS_KEY)
  if (!raw) {
    return {
      ...DEFAULT_OPTIONS,
      anchorArtistIds: [...DEFAULT_OPTIONS.anchorArtistIds],
      excludePlaylistIds: [...DEFAULT_OPTIONS.excludePlaylistIds],
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
      excludePlaylistIds: parsed.excludePlaylistIds?.length
        ? [...parsed.excludePlaylistIds]
        : [...DEFAULT_OPTIONS.excludePlaylistIds],
      genres: parsed.genres?.length ? [...parsed.genres] : [...DEFAULT_OPTIONS.genres],
      artistPopularity: parsed.artistPopularity ?? DEFAULT_OPTIONS.artistPopularity,
      maxListeners: parsed.maxListeners ?? DEFAULT_OPTIONS.maxListeners,
    }
  } catch {
    return {
      ...DEFAULT_OPTIONS,
      anchorArtistIds: [...DEFAULT_OPTIONS.anchorArtistIds],
      excludePlaylistIds: [...DEFAULT_OPTIONS.excludePlaylistIds],
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
