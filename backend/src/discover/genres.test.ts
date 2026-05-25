import { expandGenreTargets, genreOverlapScore } from './genres'

describe('expandGenreTargets', () => {
  it('includes aliases for a configured genre', () => {
    const expanded = expandGenreTargets(['house'])
    expect(expanded).toContain('house')
    expect(expanded).toContain('deep house')
    expect(expanded).toContain('edm')
  })

  it('resolves alias keys back to canonical genres', () => {
    const expanded = expandGenreTargets(['deep house'])
    expect(expanded).toContain('house')
  })
})

describe('genreOverlapScore', () => {
  it('returns zero when there are no targets', () => {
    expect(genreOverlapScore(['rock'], [])).toBe(0)
  })

  it('scores overlapping artist genres', () => {
    const score = genreOverlapScore(
      ['Progressive House', 'EDM'],
      ['house', 'deep house', 'edm']
    )
    expect(score).toBeGreaterThan(0)
  })
})
