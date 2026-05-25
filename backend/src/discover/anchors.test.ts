import { parseAnchorArtistIds } from './anchors'

const VALID_ID = '0TnOYISbd1XYRBk9myaseg'

describe('parseAnchorArtistIds', () => {
  it('accepts bare Spotify artist IDs', () => {
    expect(parseAnchorArtistIds([VALID_ID])).toEqual([VALID_ID])
  })

  it('extracts IDs from open.spotify.com URLs', () => {
    expect(
      parseAnchorArtistIds([
        `https://open.spotify.com/artist/${VALID_ID}?si=abc`,
      ])
    ).toEqual([VALID_ID])
  })

  it('deduplicates and caps at five IDs', () => {
    const ids = Array.from({ length: 7 }, (_, i) =>
      String(i).padStart(22, 'a')
    )
    const result = parseAnchorArtistIds(ids)
    expect(result).toHaveLength(5)
    expect(new Set(result).size).toBe(5)
  })

  it('ignores invalid tokens', () => {
    expect(parseAnchorArtistIds(['not-an-id', '', '  '])).toEqual([])
  })

  it('splits comma- and whitespace-separated values', () => {
    const other = 'bbbbbbbbbbbbbbbbbbbbbb'
    expect(parseAnchorArtistIds([`${VALID_ID}, ${other}`])).toEqual([
      VALID_ID,
      other,
    ])
  })
})
