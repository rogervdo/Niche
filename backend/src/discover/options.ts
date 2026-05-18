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

export const DEFAULT_OPTIONS: PlaylistOptions = {
  seeds: ['ST', 'ST', 'MT', 'MT', 'MT'],
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
    return { ...DEFAULT_OPTIONS, seeds: [...DEFAULT_OPTIONS.seeds] }
  }
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    seeds: options.seeds?.length
      ? [...options.seeds]
      : [...DEFAULT_OPTIONS.seeds],
  }
}
