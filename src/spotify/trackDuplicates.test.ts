import { duplicateTrackIds, findDuplicateGroups, getVariantLabels } from './trackDuplicates'
import type { PlaylistTrackEntry, SpotifyTrack } from './types'

function track(id: string, overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return {
    id,
    name: 'Song',
    duration_ms: 200000,
    preview_url: null,
    popularity: 50,
    artists: [{ name: 'Artist A' }],
    album: { name: 'Album', images: [] },
    external_urls: { spotify: `https://spotify/${id}` },
    ...overrides,
  }
}

function entry(id: string, overrides: Partial<SpotifyTrack> = {}): PlaylistTrackEntry {
  return {
    position: 0,
    uri: `spotify:track:${id}`,
    track: track(id, overrides),
  }
}

describe('findDuplicateGroups', () => {
  it('groups the same song across different cuts', () => {
    const entries = [
      entry('t1'),
      entry('t2', { name: 'Song (Remix)' }),
      entry('t3', { name: 'Other', artists: [{ name: 'Artist B' }] }),
    ]
    const groups = findDuplicateGroups(entries)
    expect(groups).toHaveLength(1)
    expect(groups[0].artist).toBe('Artist A')
    expect(groups[0].entries.map((e) => e.track.id)).toEqual(['t1', 't2'])
  })

  it('returns no groups when there are no duplicates', () => {
    const groups = findDuplicateGroups([
      entry('t1'),
      entry('t2', { name: 'Other' }),
    ])
    expect(groups).toHaveLength(0)
  })

  it('sorts groups by member count descending', () => {
    const entries = [
      entry('t1', { name: 'Popular' }),
      entry('t2', { name: 'Popular (Live)' }),
      entry('t3', { name: 'Popular (Remix)' }),
    ]
    const groups = findDuplicateGroups(entries)
    expect(groups).toHaveLength(1)
    expect(groups[0].entries).toHaveLength(3)
    expect(groups[0].normalizedTitle).toBe('popular')
  })
})

describe('duplicateTrackIds', () => {
  it('collects every track id in a duplicate group', () => {
    const groups = findDuplicateGroups([
      entry('t1'),
      entry('t2', { name: 'Song (Live)' }),
    ])
    expect(duplicateTrackIds(groups)).toEqual(new Set(['t1', 't2']))
  })
})

describe('getVariantLabels', () => {
  it('labels remixes and live recordings', () => {
    expect(getVariantLabels(track('t1', { name: 'Song (Remix)' }))).toEqual(['Remix'])
    expect(getVariantLabels(track('t2', { name: 'Song (Live)' }))).toEqual(['Live'])
  })

  it('labels deluxe editions', () => {
    expect(getVariantLabels(track('t1', { name: 'Song (Deluxe)' }))).toEqual([
      'Deluxe',
    ])
  })

  it('falls back to Standard for ordinary tracks', () => {
    expect(getVariantLabels(track('t1'))).toEqual(['Standard'])
  })
})
