export type PlaylistGroup = {
  id: string
  name: string
  playlistIds: string[]
}

export type LibraryPrefs = {
  version: 1
  order: string[]
  archived: string[]
  groups: PlaylistGroup[]
}

const STORAGE_PREFIX = 'niche_library_prefs_v1:'

export function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

export function defaultLibraryPrefs(): LibraryPrefs {
  return { version: 1, order: [], archived: [], groups: [] }
}

export function loadLibraryPrefs(userId: string): LibraryPrefs {
  if (!userId) return defaultLibraryPrefs()
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return defaultLibraryPrefs()
    const data = JSON.parse(raw) as Partial<LibraryPrefs>
    if (data.version !== 1) return defaultLibraryPrefs()
    return {
      version: 1,
      order: Array.isArray(data.order) ? data.order.filter((id) => typeof id === 'string') : [],
      archived: Array.isArray(data.archived)
        ? data.archived.filter((id) => typeof id === 'string')
        : [],
      groups: Array.isArray(data.groups)
        ? data.groups
            .filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string')
            .map((g) => ({
              id: g.id,
              name: g.name,
              playlistIds: Array.isArray(g.playlistIds)
                ? g.playlistIds.filter((id) => typeof id === 'string')
                : [],
            }))
        : [],
    }
  } catch {
    return defaultLibraryPrefs()
  }
}

export function saveLibraryPrefs(userId: string, prefs: LibraryPrefs): void {
  if (!userId) return
  localStorage.setItem(storageKey(userId), JSON.stringify(prefs))
}

/** Sync prefs with the current Spotify library IDs. */
export function reconcileLibraryPrefs(
  prefs: LibraryPrefs,
  playlistIds: string[]
): LibraryPrefs {
  const idSet = new Set(playlistIds)
  const order = prefs.order.filter((id) => idSet.has(id))
  for (const id of playlistIds) {
    if (!order.includes(id)) order.push(id)
  }

  const archived = prefs.archived.filter((id) => idSet.has(id))

  const groups = prefs.groups.map((g) => ({
    ...g,
    playlistIds: g.playlistIds.filter((id) => idSet.has(id)),
  }))

  return { version: 1, order, archived, groups }
}

export function isArchived(prefs: LibraryPrefs, playlistId: string): boolean {
  return prefs.archived.includes(playlistId)
}

export function orderIndex(prefs: LibraryPrefs, playlistId: string): number {
  const i = prefs.order.indexOf(playlistId)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

export function sortByCustomOrder<T extends { id: string }>(
  items: T[],
  prefs: LibraryPrefs
): T[] {
  return [...items].sort(
    (a, b) => orderIndex(prefs, a.id) - orderIndex(prefs, b.id)
  )
}

export type LibrarySection = {
  id: string
  label: string
  playlistIds: string[]
}

/** Build group sections for grouped / custom-with-groups display. */
export function buildLibrarySections(
  visibleIds: string[],
  prefs: LibraryPrefs
): LibrarySection[] {
  const visible = new Set(visibleIds)
  const assigned = new Set<string>()
  const sections: LibrarySection[] = []

  for (const group of prefs.groups) {
    const ids = group.playlistIds.filter((id) => visible.has(id))
    ids.forEach((id) => assigned.add(id))
    if (ids.length > 0) {
      sections.push({
        id: group.id,
        label: group.name,
        playlistIds: sortIdList(ids, prefs),
      })
    }
  }

  const ungrouped = visibleIds.filter((id) => !assigned.has(id))
  if (ungrouped.length > 0) {
    sections.push({
      id: '__ungrouped__',
      label: 'Ungrouped',
      playlistIds: sortIdList(ungrouped, prefs),
    })
  }

  return sections
}

function sortIdList(ids: string[], prefs: LibraryPrefs): string[] {
  return [...ids].sort((a, b) => orderIndex(prefs, a) - orderIndex(prefs, b))
}

export function movePlaylistInOrder(
  prefs: LibraryPrefs,
  playlistId: string,
  targetId: string,
  placeBefore: boolean
): LibraryPrefs {
  const order = prefs.order.filter((id) => id !== playlistId)
  const targetIdx = order.indexOf(targetId)
  if (targetIdx === -1) {
    order.push(playlistId)
  } else {
    const insertAt = placeBefore ? targetIdx : targetIdx + 1
    order.splice(insertAt, 0, playlistId)
  }
  return { ...prefs, order }
}

export function setArchived(
  prefs: LibraryPrefs,
  playlistId: string,
  archived: boolean
): LibraryPrefs {
  const set = new Set(prefs.archived)
  if (archived) set.add(playlistId)
  else set.delete(playlistId)
  return { ...prefs, archived: [...set] }
}

export function movePlaylistToGroup(
  prefs: LibraryPrefs,
  playlistId: string,
  groupId: string | null
): LibraryPrefs {
  const groups = prefs.groups.map((g) => ({
    ...g,
    playlistIds: g.playlistIds.filter((id) => id !== playlistId),
  }))

  if (groupId) {
    const g = groups.find((x) => x.id === groupId)
    if (g && !g.playlistIds.includes(playlistId)) {
      g.playlistIds.push(playlistId)
    }
  }

  return { ...prefs, groups }
}

export function addGroup(prefs: LibraryPrefs, name: string): LibraryPrefs {
  const id = `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  return {
    ...prefs,
    groups: [...prefs.groups, { id, name: name.trim() || 'New group', playlistIds: [] }],
  }
}

export function renameGroup(
  prefs: LibraryPrefs,
  groupId: string,
  name: string
): LibraryPrefs {
  return {
    ...prefs,
    groups: prefs.groups.map((g) =>
      g.id === groupId ? { ...g, name: name.trim() || g.name } : g
    ),
  }
}

export function removeGroup(prefs: LibraryPrefs, groupId: string): LibraryPrefs {
  return {
    ...prefs,
    groups: prefs.groups.filter((g) => g.id !== groupId),
  }
}

export function groupForPlaylist(
  prefs: LibraryPrefs,
  playlistId: string
): string | null {
  for (const g of prefs.groups) {
    if (g.playlistIds.includes(playlistId)) return g.id
  }
  return null
}
