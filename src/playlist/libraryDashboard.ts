import type { SpotifyPlaylist } from '../spotify/types'
import {
  addGroup,
  buildLibrarySections,
  groupForPlaylist,
  isArchived,
  movePlaylistInOrder,
  movePlaylistToGroup,
  removeGroup,
  renameGroup,
  setArchived,
  sortByCustomOrder,
  type LibraryPrefs,
  type PlaylistGroup,
} from './libraryPrefs'

export const NICHE_PLAYLIST_DRAG_TYPE = 'application/x-niche-playlist-id'

export type PlaylistCardRenderer = (p: SpotifyPlaylist) => string

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

export function playlistCardWithChrome(
  p: SpotifyPlaylist,
  innerHtml: string,
  opts: {
    draggable: boolean
    showMenu: boolean
    archived: boolean
  }
): string {
  return `
    <div
      class="card-wrap${opts.draggable ? ' card-wrap--draggable' : ''}"
      data-playlist-id="${p.id}"
      ${opts.draggable ? `draggable="true"` : ''}
    >
      ${
        opts.showMenu
          ? `<div class="card-chrome">
              <button
                type="button"
                class="card-menu-btn"
                data-playlist-menu="${p.id}"
                aria-label="Playlist options for ${escapeHtml(p.name)}"
                title="Options"
              >⋯</button>
            </div>`
          : ''
      }
      ${innerHtml}
    </div>
  `
}

export function renderFlatGrid(
  items: SpotifyPlaylist[],
  cardHtml: PlaylistCardRenderer,
  opts: { draggable: boolean; showMenu: boolean; archived: boolean }
): string {
  return items
    .map((p) =>
      playlistCardWithChrome(p, cardHtml(p), {
        ...opts,
        archived: opts.archived || false,
      })
    )
    .join('')
}

export function renderGroupedLibrary(
  items: SpotifyPlaylist[],
  prefs: LibraryPrefs,
  cardHtml: PlaylistCardRenderer,
  opts: { draggable: boolean; showMenu: boolean }
): string {
  const byId = new Map(items.map((p) => [p.id, p]))
  const sections = buildLibrarySections(
    items.map((p) => p.id),
    prefs
  )

  if (sections.length === 0) {
    return '<p class="empty">No playlists match your filters.</p>'
  }

  return sections
    .map((section) => {
      const cards = section.playlistIds
        .map((id) => byId.get(id))
        .filter((p): p is SpotifyPlaylist => p != null)
        .map((p) =>
          playlistCardWithChrome(p, cardHtml(p), {
            draggable: opts.draggable,
            showMenu: opts.showMenu,
            archived: isArchived(prefs, p.id),
          })
        )
        .join('')

      return `
        <section class="playlist-group-section" data-group-id="${escapeHtml(section.id)}">
          <div class="track-group-separator playlist-group-label" role="separator">${escapeHtml(section.label)}</div>
          <div class="grid playlist-group-grid">${cards}</div>
        </section>
      `
    })
    .join('')
}

export function applyCustomSort(
  items: SpotifyPlaylist[],
  prefs: LibraryPrefs
): SpotifyPlaylist[] {
  return sortByCustomOrder(items, prefs)
}

export type LibraryDashboardBindings = {
  root: HTMLElement
  prefs: LibraryPrefs
  onPrefsChange: (prefs: LibraryPrefs) => void
  groups: PlaylistGroup[]
  customOrderMode: boolean
  openPlaylist: (id: string) => void
  cardSelector: string
}

function closeCardMenus(root: HTMLElement): void {
  root.querySelectorAll('.card-menu-popover').forEach((el) => el.remove())
  root.querySelectorAll('.card-menu-btn[aria-expanded="true"]').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false')
  })
}

function menuPopoverHtml(
  playlistId: string,
  prefs: LibraryPrefs,
  groups: PlaylistGroup[]
): string {
  const archived = isArchived(prefs, playlistId)
  const currentGroup = groupForPlaylist(prefs, playlistId)

  const groupOptions = groups
    .map(
      (g) => `
      <button type="button" class="card-menu-item" data-action="group" data-group-id="${g.id}" data-playlist-id="${playlistId}">
        ${currentGroup === g.id ? '✓ ' : ''}${escapeHtml(g.name)}
      </button>
    `
    )
    .join('')

  return `
    <div class="card-menu-popover" role="menu">
      <button type="button" class="card-menu-item" data-action="archive" data-playlist-id="${playlistId}">
        ${archived ? 'Unarchive' : 'Archive'}
      </button>
      ${
        groups.length > 0
          ? `<div class="card-menu-divider" role="separator"></div>
             <p class="card-menu-heading">Move to group</p>
             ${groupOptions}
             <button type="button" class="card-menu-item" data-action="ungroup" data-playlist-id="${playlistId}">
               ${currentGroup == null ? '✓ ' : ''}Ungrouped
             </button>`
          : ''
      }
    </div>
  `
}

export function bindLibraryDashboard(bind: LibraryDashboardBindings): void {
  const { root, onPrefsChange, openPlaylist, customOrderMode } = bind
  let prefs = bind.prefs

  const persist = (next: LibraryPrefs) => {
    prefs = next
    onPrefsChange(next)
  }

  root.querySelectorAll<HTMLButtonElement>(bind.cardSelector).forEach((card) => {
    card.addEventListener('click', () => {
      const wrap = card.closest<HTMLElement>('.card-wrap')
      const id = wrap?.dataset.playlistId ?? card.dataset.playlistId
      if (id) openPlaylist(id)
    })
  })

  root.querySelectorAll<HTMLButtonElement>('.card-menu-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const playlistId = btn.dataset.playlistMenu
      if (!playlistId) return

      const existing = btn.parentElement?.querySelector('.card-menu-popover')
      if (existing) {
        closeCardMenus(root)
        return
      }

      closeCardMenus(root)
      btn.setAttribute('aria-expanded', 'true')
      const pop = document.createElement('div')
      pop.innerHTML = menuPopoverHtml(playlistId, prefs, bind.groups)
      const popover = pop.firstElementChild as HTMLElement
      btn.parentElement?.appendChild(popover)

      popover.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((item) => {
        item.addEventListener('click', (ev) => {
          ev.stopPropagation()
          const action = item.dataset.action
          const pid = item.dataset.playlistId ?? playlistId
          if (action === 'archive') {
            persist(setArchived(prefs, pid, !isArchived(prefs, pid)))
          } else if (action === 'group') {
            const gid = item.dataset.groupId
            if (gid) persist(movePlaylistToGroup(prefs, pid, gid))
          } else if (action === 'ungroup') {
            persist(movePlaylistToGroup(prefs, pid, null))
          }
          closeCardMenus(root)
        })
      })

      setTimeout(() => {
        document.addEventListener(
          'click',
          () => closeCardMenus(root),
          { once: true }
        )
      }, 0)
    })
  })

  if (!customOrderMode) return

  let dragId: string | null = null

  root.querySelectorAll<HTMLElement>('.card-wrap--draggable').forEach((wrap) => {
    wrap.addEventListener('dragstart', (e) => {
      dragId = wrap.dataset.playlistId ?? null
      wrap.classList.add('card-wrap--dragging')
      if (e.dataTransfer && dragId) {
        e.dataTransfer.setData(NICHE_PLAYLIST_DRAG_TYPE, dragId)
        e.dataTransfer.effectAllowed = 'move'
      }
    })
    wrap.addEventListener('dragend', () => {
      wrap.classList.remove('card-wrap--dragging')
      root.querySelectorAll('.card-wrap--drop-target').forEach((el) => {
        el.classList.remove('card-wrap--drop-target')
      })
      dragId = null
    })
    wrap.addEventListener('dragover', (e) => {
      if (!dragId || wrap.dataset.playlistId === dragId) return
      e.preventDefault()
      wrap.classList.add('card-wrap--drop-target')
    })
    wrap.addEventListener('dragleave', () => {
      wrap.classList.remove('card-wrap--drop-target')
    })
    wrap.addEventListener('drop', (e) => {
      e.preventDefault()
      wrap.classList.remove('card-wrap--drop-target')
      const sourceId =
        e.dataTransfer?.getData(NICHE_PLAYLIST_DRAG_TYPE) || dragId
      const targetId = wrap.dataset.playlistId
      if (!sourceId || !targetId || sourceId === targetId) return
      const rect = wrap.getBoundingClientRect()
      const placeBefore = e.clientY < rect.top + rect.height / 2
      persist(movePlaylistInOrder(prefs, sourceId, targetId, placeBefore))
    })
  })
}

export function bindManageGroupsModal(
  root: HTMLElement,
  prefs: LibraryPrefs,
  onSave: (prefs: LibraryPrefs) => void,
  onClose: () => void
): void {
  const overlay = root.querySelector<HTMLElement>('.library-groups-overlay')
  const dialog = root.querySelector<HTMLElement>('.library-groups-dialog')
  if (!overlay || !dialog) return

  const renderList = () => {
    const list = dialog.querySelector<HTMLElement>('.library-groups-list')
    if (!list) return
    list.innerHTML = prefs.groups
      .map(
        (g) => `
        <div class="library-group-row" data-group-id="${g.id}">
          <input type="text" class="library-group-name" value="${escapeHtml(g.name)}" aria-label="Group name" />
          <span class="library-group-count">${g.playlistIds.length} playlist${g.playlistIds.length === 1 ? '' : 's'}</span>
          <button type="button" class="btn-ghost library-group-delete" data-group-id="${g.id}">Delete</button>
        </div>
      `
      )
      .join('')
  }

  renderList()

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onClose()
  })
  dialog.querySelector('.library-groups-close')?.addEventListener('click', onClose)
  dialog.querySelector('.library-groups-done')?.addEventListener('click', onClose)

  dialog.querySelector('#library-group-add')?.addEventListener('click', () => {
    const input = dialog.querySelector<HTMLInputElement>('#library-group-new-name')
    const name = input?.value.trim() || 'New group'
    prefs = addGroup(prefs, name)
    if (input) input.value = ''
    onSave(prefs)
    renderList()
  })

  dialog.addEventListener('click', (e) => {
    const del = (e.target as HTMLElement).closest<HTMLButtonElement>(
      '.library-group-delete'
    )
    if (!del?.dataset.groupId) return
    prefs = removeGroup(prefs, del.dataset.groupId)
    onSave(prefs)
    renderList()
  })

  dialog.addEventListener('change', (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>(
      '.library-group-name'
    )
    if (!input) return
    const row = input.closest<HTMLElement>('.library-group-row')
    const groupId = row?.dataset.groupId
    if (!groupId) return
    prefs = renameGroup(prefs, groupId, input.value)
    onSave(prefs)
  })
}

export function manageGroupsModalHtml(): string {
  return `
    <div class="library-groups-overlay replace-modal-overlay" role="presentation">
      <div class="library-groups-dialog replace-modal" role="dialog" aria-labelledby="library-groups-title">
        <h2 id="library-groups-title" class="replace-modal-title">Manage playlist groups</h2>
        <p class="library-groups-lede">Groups appear when sort is <strong>Grouped</strong> or <strong>My order</strong> (if you have groups).</p>
        <div class="library-groups-list"></div>
        <div class="library-groups-add">
          <input type="text" id="library-group-new-name" placeholder="New group name" />
          <button type="button" class="btn-ghost" id="library-group-add">Add group</button>
        </div>
        <div class="replace-modal-actions">
          <button type="button" class="btn-replace-cancel library-groups-close">Cancel</button>
          <button type="button" class="btn-replace-confirm library-groups-done">Done</button>
        </div>
      </div>
    </div>
  `
}
