import type { RecentPlaylistItem } from './recentActivity'

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

export function filterPlaylistPicks(picksEl: HTMLElement, query: string): void {
  const q = query.trim().toLowerCase()
  picksEl.querySelectorAll<HTMLElement>('.cart-playlist-pick').forEach((btn) => {
    const name =
      btn.querySelector('.cart-playlist-pick-name')?.textContent?.toLowerCase() ?? ''
    const sub =
      btn.querySelector('.cart-playlist-pick-sub')?.textContent?.toLowerCase() ?? ''
    const show = !q || name.includes(q) || sub.includes(q)
    btn.classList.toggle('cart-playlist-pick--hidden', !show)
  })
}

export function filterRecentPlaylists(
  items: RecentPlaylistItem[],
  allowedIds: Set<string>,
  excludeId?: string
): RecentPlaylistItem[] {
  return items
    .filter((item) => item.id !== excludeId && allowedIds.has(item.id))
    .slice(0, 3)
}

export function recentPlaylistsHtml(items: RecentPlaylistItem[]): string {
  if (!items.length) return ''
  return `
    <div class="playlist-picker-recent recent-activity" role="list" aria-label="Recent playlists">
      ${items
        .map(
          (item, i) => `
            <button
              type="button"
              class="pill-btn recent-activity-btn"
              data-recent-index="${i}"
              role="listitem"
              title="${escapeHtml(item.name)}"
            ><span>${escapeHtml(item.name)}</span></button>
          `
        )
        .join('')}
    </div>
  `
}

export function bindRecentPlaylists(
  root: HTMLElement,
  items: RecentPlaylistItem[],
  onPick: (playlistId: string) => void
): void {
  root.querySelectorAll<HTMLButtonElement>('.recent-activity-btn').forEach((btn) => {
    const i = Number(btn.dataset.recentIndex)
    const item = items[i]
    if (!item) return
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      onPick(item.id)
    })
  })
}

export function bindPlaylistSearch(
  searchInput: HTMLInputElement,
  picksEl: HTMLElement
): void {
  const onSearch = () => filterPlaylistPicks(picksEl, searchInput.value)
  searchInput.addEventListener('input', onSearch)
  searchInput.addEventListener('keydown', (e) => e.stopPropagation())
  searchInput.addEventListener('click', (e) => e.stopPropagation())
  onSearch()
}
