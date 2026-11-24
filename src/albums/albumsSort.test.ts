import { filterAlbums, sortAlbums } from './albumsSort'
import type { SavedAlbumItem, SpotifyAlbumFull } from '../spotify/types'

function album(
  overrides: Partial<SpotifyAlbumFull> & { id: string; name: string }
): SpotifyAlbumFull {
  return {
    album_type: 'album',
    artists: [{ name: 'Artist' }],
    images: null,
    release_date: '2020-06-01',
    release_date_precision: 'day',
    total_tracks: 10,
    external_urls: { spotify: 'https://open.spotify.com/album/x' },
    ...overrides,
  }
}

function saved(addedAt: string, a: SpotifyAlbumFull): SavedAlbumItem {
  return { added_at: addedAt, album: a }
}

describe('filterAlbums', () => {
  const albums = [
    saved(
      '2024-01-01T00:00:00Z',
      album({ id: '1', name: 'Blue Train', artists: [{ name: 'John Coltrane' }] })
    ),
    saved(
      '2023-01-01T00:00:00Z',
      album({
        id: '2',
        name: 'Kind of Blue',
        album_type: 'single',
        artists: [{ name: 'Miles Davis' }],
      })
    ),
    saved(
      '2022-01-01T00:00:00Z',
      album({
        id: '3',
        name: 'Greatest Hits',
        album_type: 'compilation',
        artists: [{ name: 'Various' }],
      })
    ),
  ]

  it('returns everything for an empty query and "all" type', () => {
    expect(filterAlbums(albums, '', 'all')).toHaveLength(3)
  })

  it('matches album names case-insensitively', () => {
    expect(filterAlbums(albums, 'blue', 'all').map((i) => i.album.id)).toEqual([
      '1',
      '2',
    ])
  })

  it('matches artist names', () => {
    expect(
      filterAlbums(albums, 'coltrane', 'all').map((i) => i.album.id)
    ).toEqual(['1'])
  })

  it('filters by album type', () => {
    expect(filterAlbums(albums, '', 'single').map((i) => i.album.id)).toEqual([
      '2',
    ])
    expect(
      filterAlbums(albums, '', 'compilation').map((i) => i.album.id)
    ).toEqual(['3'])
  })

  it('combines query and type filter', () => {
    expect(filterAlbums(albums, 'blue', 'single').map((i) => i.album.id)).toEqual(
      ['2']
    )
  })
})

describe('sortAlbums', () => {
  const older = saved(
    '2022-05-01T00:00:00Z',
    album({
      id: 'older',
      name: 'Zebra',
      artists: [{ name: 'Zed' }],
      release_date: '2019-03-01',
      total_tracks: 12,
    })
  )
  const middle = saved(
    '2023-05-01T00:00:00Z',
    album({
      id: 'middle',
      name: 'Apple',
      artists: [{ name: 'Alice' }],
      release_date: '2021-07-01',
      total_tracks: 4,
    })
  )
  const newest = saved(
    '2024-05-01T00:00:00Z',
    album({
      id: 'newest',
      name: 'Mango',
      artists: [{ name: 'Mona' }],
      release_date: '2023-01-01',
      total_tracks: 20,
    })
  )

  const albums = [middle, newest, older]

  it('sorts by recently added first', () => {
    expect(sortAlbums(albums, 'added_desc').map((i) => i.album.id)).toEqual([
      'newest',
      'middle',
      'older',
    ])
  })

  it('sorts by oldest added first', () => {
    expect(sortAlbums(albums, 'added_asc').map((i) => i.album.id)).toEqual([
      'older',
      'middle',
      'newest',
    ])
  })

  it('sorts by name in both directions', () => {
    expect(sortAlbums(albums, 'name').map((i) => i.album.id)).toEqual([
      'middle',
      'newest',
      'older',
    ])
    expect(sortAlbums(albums, 'name_desc').map((i) => i.album.id)).toEqual([
      'older',
      'newest',
      'middle',
    ])
  })

  it('sorts by artist name', () => {
    expect(sortAlbums(albums, 'artist').map((i) => i.album.id)).toEqual([
      'middle',
      'newest',
      'older',
    ])
  })

  it('sorts by release year', () => {
    expect(sortAlbums(albums, 'year_desc').map((i) => i.album.id)).toEqual([
      'newest',
      'middle',
      'older',
    ])
    expect(sortAlbums(albums, 'year_asc').map((i) => i.album.id)).toEqual([
      'older',
      'middle',
      'newest',
    ])
  })

  it('sorts by track count', () => {
    expect(sortAlbums(albums, 'tracks_desc').map((i) => i.album.id)).toEqual([
      'newest',
      'older',
      'middle',
    ])
  })

  it('does not mutate the input array', () => {
    const original = [...albums]
    sortAlbums(albums, 'name')
    expect(albums).toEqual(original)
  })
})
