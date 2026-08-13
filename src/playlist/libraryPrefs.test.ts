import {
  addGroup,
  buildLibrarySections,
  defaultLibraryPrefs,
  groupForPlaylist,
  isArchived,
  movePlaylistInOrder,
  movePlaylistToGroup,
  orderIndex,
  reconcileLibraryPrefs,
  removeGroup,
  renameGroup,
  setArchived,
  sortByCustomOrder,
  storageKey,
  type LibraryPrefs,
} from './libraryPrefs'

function prefs(overrides: Partial<LibraryPrefs> = {}): LibraryPrefs {
  return { version: 1, order: [], archived: [], groups: [], ...overrides }
}

describe('storageKey', () => {
  it('scopes keys by user', () => {
    expect(storageKey('user-1')).toBe('niche_library_prefs_v1:user-1')
  })
})

describe('defaultLibraryPrefs', () => {
  it('returns empty prefs', () => {
    expect(defaultLibraryPrefs()).toEqual({
      version: 1,
      order: [],
      archived: [],
      groups: [],
    })
  })
})

describe('reconcileLibraryPrefs', () => {
  it('drops removed playlists and appends new ones', () => {
    const result = reconcileLibraryPrefs(
      prefs({
        order: ['p1', 'p2'],
        archived: ['p2', 'p3'],
        groups: [{ id: 'g1', name: 'G', playlistIds: ['p1', 'p3'] }],
      }),
      ['p2', 'p3', 'p4']
    )
    expect(result.order).toEqual(['p2', 'p3', 'p4'])
    expect(result.archived).toEqual(['p2', 'p3'])
    expect(result.groups[0].playlistIds).toEqual(['p3'])
  })
})

describe('archiving and ordering', () => {
  it('checks archived state', () => {
    const p = prefs({ archived: ['p1'] })
    expect(isArchived(p, 'p1')).toBe(true)
    expect(isArchived(p, 'p2')).toBe(false)
  })

  it('returns the order index or a large fallback', () => {
    const p = prefs({ order: ['p1', 'p2'] })
    expect(orderIndex(p, 'p1')).toBe(0)
    expect(orderIndex(p, 'missing')).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('sorts items by custom order', () => {
    const p = prefs({ order: ['c', 'a'] })
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(sortByCustomOrder(items, p).map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('sets and clears archived state immutably', () => {
    const p = prefs({ archived: ['p1'] })
    const archived = setArchived(p, 'p2', true)
    expect(archived.archived).toEqual(['p1', 'p2'])
    expect(p.archived).toEqual(['p1'])
    expect(setArchived(archived, 'p1', false).archived).toEqual(['p2'])
  })

  it('moves a playlist before or after a target', () => {
    const p = prefs({ order: ['a', 'b', 'c'] })
    expect(movePlaylistInOrder(p, 'c', 'a', true).order).toEqual(['c', 'a', 'b'])
    expect(movePlaylistInOrder(p, 'c', 'a', false).order).toEqual(['a', 'c', 'b'])
  })

  it('appends when the target is missing', () => {
    const p = prefs({ order: ['a'] })
    expect(movePlaylistInOrder(p, 'b', 'zzz', true).order).toEqual(['a', 'b'])
  })
})

describe('groups', () => {
  it('moves a playlist between groups', () => {
    const p = prefs({
      groups: [
        { id: 'g1', name: 'Rock', playlistIds: ['p1', 'p2'] },
        { id: 'g2', name: 'Jazz', playlistIds: [] },
      ],
    })
    const result = movePlaylistToGroup(p, 'p1', 'g2')
    expect(result.groups[0].playlistIds).toEqual(['p2'])
    expect(result.groups[1].playlistIds).toEqual(['p1'])
  })

  it('adds a group with a sanitized name', () => {
    const result = addGroup(prefs(), '  ')
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].name).toBe('New group')
    expect(result.groups[0].id).toMatch(/^g_/)
  })

  it('renames and removes groups', () => {
    const p = prefs({ groups: [{ id: 'g1', name: 'Rock', playlistIds: [] }] })
    expect(renameGroup(p, 'g1', 'Metal').groups[0].name).toBe('Metal')
    expect(removeGroup(p, 'g1').groups).toEqual([])
  })

  it('finds the group containing a playlist', () => {
    const p = prefs({
      groups: [{ id: 'g1', name: 'Rock', playlistIds: ['p1'] }],
    })
    expect(groupForPlaylist(p, 'p1')).toBe('g1')
    expect(groupForPlaylist(p, 'p2')).toBeNull()
  })
})

describe('buildLibrarySections', () => {
  it('builds group sections plus an ungrouped section', () => {
    const p = prefs({
      order: ['p1', 'p3', 'p2'],
      groups: [{ id: 'g1', name: 'Rock', playlistIds: ['p2'] }],
    })
    const sections = buildLibrarySections(['p1', 'p2', 'p3'], p)
    expect(sections).toEqual([
      { id: 'g1', label: 'Rock', playlistIds: ['p2'] },
      { id: '__ungrouped__', label: 'Ungrouped', playlistIds: ['p1', 'p3'] },
    ])
  })

  it('omits empty groups', () => {
    const p = prefs({
      groups: [{ id: 'g1', name: 'Empty', playlistIds: ['zzz'] }],
    })
    expect(buildLibrarySections(['p1'], p)).toEqual([
      { id: '__ungrouped__', label: 'Ungrouped', playlistIds: ['p1'] },
    ])
  })
})
