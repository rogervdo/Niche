export type RecentPlaylistItem = { id: string; name: string }

const MAX_RECENT = 3
const STORAGE_PREFIX = 'niche_find_library_recent_v1:'

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

function parseItems(raw: unknown): RecentPlaylistItem[] {
  if (!Array.isArray(raw)) return []
  const items: RecentPlaylistItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const id = (entry as { id?: string }).id
    const name = (entry as { name?: string }).name
    if (typeof id !== 'string' || typeof name !== 'string' || !name.trim()) continue
    items.push({ id, name: name.trim() })
  }
  return items.slice(0, MAX_RECENT)
}

export function loadRecent(userId: string): RecentPlaylistItem[] {
  if (!userId) return []
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    return parseItems(JSON.parse(raw))
  } catch {
    return []
  }
}

export function pushRecentPlaylist(userId: string, id: string, name: string): void {
  const trimmed = name.trim()
  if (!userId || !id || !trimmed) return
  const prev = loadRecent(userId)
  const next = [{ id, name: trimmed }, ...prev.filter((p) => p.id !== id)].slice(
    0,
    MAX_RECENT
  )
  localStorage.setItem(storageKey(userId), JSON.stringify(next))
}
