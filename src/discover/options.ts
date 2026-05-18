export type SeedCode = 'AA' | 'MA' | 'SA' | 'AT' | 'MT' | 'ST'

export interface PlaylistOptions {
  seeds: SeedCode[]
  acousticness: [number, number]
  danceability: [number, number]
  energy: [number, number]
  instrumentalness: [number, number]
  popularity: [number, number]
  valence: [number, number]
}

export const SEED_LABELS: Record<SeedCode, string> = {
  ST: 'Recent tracks',
  MT: 'Medium-term tracks',
  AT: 'All-time tracks',
  SA: 'Recent artists',
  MA: 'Medium-term artists',
  AA: 'All-time artists',
}

export const ALL_SEEDS: SeedCode[] = ['AA', 'MA', 'SA', 'AT', 'MT', 'ST']

/** Same defaults as discoverify's userSchema. */
export const DEFAULT_OPTIONS: PlaylistOptions = {
  seeds: ['ST', 'ST', 'MT', 'MT', 'MT'],
  acousticness: [10, 90],
  danceability: [10, 90],
  energy: [10, 90],
  instrumentalness: [10, 90],
  popularity: [50, 100],
  valence: [10, 90],
}

const OPTIONS_KEY = 'niche_discover_options'
const PLAYLIST_ID_KEY = 'niche_discover_playlist_id'

export function loadOptions(): PlaylistOptions {
  const raw = localStorage.getItem(OPTIONS_KEY)
  if (!raw) return { ...DEFAULT_OPTIONS, seeds: [...DEFAULT_OPTIONS.seeds] }
  try {
    const parsed = JSON.parse(raw) as PlaylistOptions
    return {
      ...DEFAULT_OPTIONS,
      ...parsed,
      seeds: parsed.seeds?.length ? [...parsed.seeds] : [...DEFAULT_OPTIONS.seeds],
    }
  } catch {
    return { ...DEFAULT_OPTIONS, seeds: [...DEFAULT_OPTIONS.seeds] }
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
