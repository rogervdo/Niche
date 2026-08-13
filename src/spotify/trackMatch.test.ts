import {
  albumEditionPenalty,
  coreTitleForSearch,
  findBestPopularityMatch,
  isExcludedRecording,
  isLiveRecording,
  isRemixRecording,
  normalizeAlbumName,
  normalizeTrackTitle,
  scoreCandidate,
  stripLiveFromTitle,
  stripRemixFromTitle,
} from './trackMatch'
import type { SpotifyTrack } from './types'

function track(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return {
    id: 't1',
    name: 'Song',
    duration_ms: 200000,
    preview_url: null,
    popularity: 40,
    artists: [{ name: 'Artist A' }],
    album: { name: 'Album', images: [] },
    external_urls: { spotify: 'https://spotify/t1' },
    ...overrides,
  }
}

describe('title normalization', () => {
  it('strips parenthetical and trailing remix markers', () => {
    expect(stripRemixFromTitle('Song (Foo Remix)')).toBe('Song')
    expect(stripRemixFromTitle('Song - Single Remix')).toBe('Song')
    expect(stripRemixFromTitle('Song')).toBe('Song')
  })

  it('strips live markers', () => {
    expect(stripLiveFromTitle('Song (Live at Wembley)')).toBe('Song')
    expect(stripLiveFromTitle('Song - Live Version')).toBe('Song')
    expect(stripLiveFromTitle('Song')).toBe('Song')
  })

  it('removes feature credits from the core title', () => {
    expect(coreTitleForSearch('Song (Remix) feat. Artist B')).toBe('Song')
    expect(coreTitleForSearch('Song ft. Artist B')).toBe('Song')
  })

  it('normalizes variant cuts to a studio title', () => {
    expect(normalizeTrackTitle('Song - Remastered 2010')).toBe('song')
    expect(normalizeTrackTitle('Song (Live)')).toBe('song')
    expect(normalizeTrackTitle('Song')).toBe('song')
  })

  it('normalizes album edition markers', () => {
    expect(normalizeAlbumName('Too Fast For Love (Deluxe Version)')).toBe(
      'too fast for love'
    )
    expect(normalizeAlbumName('Album - Remastered')).toBe('album')
    expect(normalizeAlbumName('Album')).toBe('album')
  })
})

describe('recording classification', () => {
  it('detects remixes from title and album', () => {
    expect(isRemixRecording(track({ name: 'Song (Remix)' }))).toBe(true)
    expect(isRemixRecording(track({ album: { name: 'Remixes', images: [] } }))).toBe(true)
    expect(isRemixRecording(track())).toBe(false)
  })

  it('detects live recordings from title and album', () => {
    expect(isLiveRecording(track({ name: 'Song (Live)' }))).toBe(true)
    expect(isLiveRecording(track({ album: { name: 'Live at the Apollo', images: [] } }))).toBe(true)
    expect(isLiveRecording(track())).toBe(false)
  })

  it('excludes remix and live recordings', () => {
    expect(isExcludedRecording(track({ name: 'Song (Remix)' }))).toBe(true)
    expect(isExcludedRecording(track({ name: 'Song (Live)' }))).toBe(true)
    expect(isExcludedRecording(track())).toBe(false)
  })

  it('scores edition penalties for deluxe/soundtrack albums', () => {
    expect(albumEditionPenalty('Album')).toBe(0)
    expect(albumEditionPenalty('Deluxe Edition')).toBe(45)
    expect(albumEditionPenalty('Live')).toBe(40)
  })
})

describe('scoreCandidate', () => {
  it('scores popularity plus a standard-edition bonus', () => {
    const current = track()
    const candidate = track({ id: 't2', popularity: 80 })
    expect(scoreCandidate(current, candidate)).toBeCloseTo(80 + 35, 5)
  })

  it('penalizes deluxe albums', () => {
    const current = track()
    const candidate = track({
      id: 't2',
      popularity: 80,
      album: { name: 'Deluxe Edition', images: [] },
    })
    expect(scoreCandidate(current, candidate)).toBeCloseTo(80 + (100 - 45) * 0.35, 5)
  })
})

describe('findBestPopularityMatch', () => {
  it('finds a more popular standard version of the same song', () => {
    const current = track()
    const candidate = track({ id: 't2', popularity: 95 })
    expect(findBestPopularityMatch(current, [candidate])).toEqual({
      status: 'found',
      candidate,
    })
  })

  it('returns insufficient_gain for a marginal improvement', () => {
    const current = track()
    const candidate = track({ id: 't2', popularity: 41 })
    expect(findBestPopularityMatch(current, [candidate])).toEqual({
      status: 'insufficient_gain',
      candidate,
    })
  })

  it('rejects remix and live candidates', () => {
    const current = track()
    const remix = track({ id: 't2', name: 'Song (Remix)', popularity: 95 })
    const live = track({ id: 't3', name: 'Song (Live)', popularity: 95 })
    expect(findBestPopularityMatch(current, [remix])).toEqual({ status: 'none' })
    expect(findBestPopularityMatch(current, [live])).toEqual({ status: 'none' })
  })

  it('rejects candidates by a different artist', () => {
    const current = track()
    const other = track({
      id: 't2',
      popularity: 95,
      artists: [{ name: 'Artist B' }],
    })
    expect(findBestPopularityMatch(current, [other])).toEqual({ status: 'none' })
  })

  it('returns none with no candidates', () => {
    expect(findBestPopularityMatch(track(), [])).toEqual({ status: 'none' })
  })
})
