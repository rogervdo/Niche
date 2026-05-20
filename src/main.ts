import './style.css'
import {
  clearAuth,
  getStoredTokens,
  handleAuthCallback,
  isConfigured,
  loginWithSpotify,
  needsReauth,
} from './spotify/auth'
import {
  classifyPlaylist,
  getAllPlaylists,
  getCurrentUser,
  getPlaylistTrackEntries,
  spotifyFetch,
  type PlaylistKind,
} from './spotify/api'
import {
  clearPlaylistCache,
  getCachedPlaylists,
  getCachedPlaylistEntries,
  setCachedPlaylists,
  setCachedEntries,
  upsertCachedPlaylist,
} from './spotify/playlistCache'
import { mountCartUI, unmountCartUI } from './cart/ui'
import { renderDiscoverView } from './discover/view'
import { renderPlaylistDetail } from './playlist/detailView'
import {
  bindLibraryDashboard,
  bindManageGroupsModal,
  manageGroupsModalHtml,
  renderFlatGrid,
  renderGroupedLibrary,
  applyCustomSort,
} from './playlist/libraryDashboard'
import {
  loadLibraryPrefs,
  reconcileLibraryPrefs,
  saveLibraryPrefs,
  isArchived,
  type LibraryPrefs,
} from './playlist/libraryPrefs'
import { IMAGE_SIZES, renderImg } from './spotify/images'
import type { SpotifyImage } from './spotify/images'
import type { SpotifyPlaylist } from './spotify/types'

const app = document.querySelector<HTMLDivElement>('#app')!

type Filter = 'all' | PlaylistKind | 'archived'
type AppView = 'dashboard' | 'discover' | 'detail'

type PlaylistSortMode =
  | 'library'
  | 'custom'
  | 'grouped'
  | 'name_asc'
  | 'name_desc'
  | 'tracks_desc'
  | 'tracks_asc'
  | 'owner_asc'
  | 'owner_desc'
  | 'kind'
  | 'public_first'
  | 'collaborative_first'

const PLAYLIST_SORT_OPTIONS: { mode: PlaylistSortMode; label: string }[] = [
  { mode: 'library', label: 'Spotify library order' },
  { mode: 'custom', label: 'My order' },
  { mode: 'grouped', label: 'Grouped' },
  { mode: 'name_asc', label: 'Name (A to Z)' },
  { mode: 'name_desc', label: 'Name (Z to A)' },
  { mode: 'tracks_desc', label: 'Most tracks' },
  { mode: 'tracks_asc', label: 'Fewest tracks' },
  { mode: 'owner_asc', label: 'Owner (A to Z)' },
  { mode: 'owner_desc', label: 'Owner (Z to A)' },
  { mode: 'kind', label: 'Type (yours, collaborative, followed)' },
  { mode: 'public_first', label: 'Public first' },
  { mode: 'collaborative_first', label: 'Collaborative first' },
]

const PLAYLIST_SORT_STORAGE_KEY = 'niche_playlist_sort'
const PLAYLIST_SORT_MODES = new Set<PlaylistSortMode>(
  PLAYLIST_SORT_OPTIONS.map((o) => o.mode)
)

const PLAYLIST_FILTER_STORAGE_KEY = 'niche_playlist_filter'
const PLAYLIST_FILTERS = new Set<Filter>([
  'all',
  'yours',
  'collaborative',
  'followed',
  'archived',
])

let playlists: SpotifyPlaylist[] = []
let userId = ''

function loadPlaylistFilter(): Filter {
  const raw = localStorage.getItem(PLAYLIST_FILTER_STORAGE_KEY)
  if (raw && PLAYLIST_FILTERS.has(raw as Filter)) {
    return raw as Filter
  }
  return 'all'
}

let activeFilter: Filter = loadPlaylistFilter()
let searchQuery = ''
let displayName = ''
let userImages: SpotifyImage[] | null = null
let userMarket = 'US'
let currentView: AppView = 'dashboard'
let playlistsRefreshing = false

const PLAYLIST_GRID_MIN = 160
const PLAYLIST_GRID_MAX = 400
const PLAYLIST_GRID_STEP = 24
const PLAYLIST_GRID_STORAGE_KEY = 'niche_playlist_grid_min'

function loadPlaylistGridMin(): number {
  const raw = localStorage.getItem(PLAYLIST_GRID_STORAGE_KEY)
  const n = raw ? Number(raw) : NaN
  if (!Number.isFinite(n)) return 260
  return Math.min(PLAYLIST_GRID_MAX, Math.max(PLAYLIST_GRID_MIN, Math.round(n)))
}

let playlistGridMin = loadPlaylistGridMin()

function loadPlaylistSortMode(): PlaylistSortMode {
  const raw = localStorage.getItem(PLAYLIST_SORT_STORAGE_KEY)
  if (raw && PLAYLIST_SORT_MODES.has(raw as PlaylistSortMode)) {
    return raw as PlaylistSortMode
  }
  return 'library'
}

let playlistSortMode = loadPlaylistSortMode()
let libraryPrefs: LibraryPrefs = defaultLibraryPrefsForUser()
let showGroupsModal = false

function defaultLibraryPrefsForUser(): LibraryPrefs {
  return { version: 1, order: [], archived: [], groups: [] }
}

function syncLibraryPrefs(): void {
  if (!userId) return
  libraryPrefs = reconcileLibraryPrefs(
    libraryPrefs,
    playlists.map((p) => p.id)
  )
  saveLibraryPrefs(userId, libraryPrefs)
}

function setLibraryPrefs(next: LibraryPrefs): void {
  libraryPrefs = next
  if (userId) saveLibraryPrefs(userId, libraryPrefs)
  if (currentView === 'dashboard') renderDashboard()
}

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

function formatKind(kind: PlaylistKind): string {
  switch (kind) {
    case 'yours':
      return 'Yours'
    case 'collaborative':
      return 'Collaborative'
    case 'followed':
      return 'Followed'
  }
}

function renderLogin(missingConfig: boolean, scopeUpgrade = false): void {
  app.innerHTML = `
    <div class="shell login-shell">
      <header class="hero">
        <p class="eyebrow">Niche</p>
        <h1>Your Spotify playlists</h1>
        <p class="lede">
          Connect Spotify to browse every playlist in your library — ones you own,
          ones you follow, and collaborative lists.
        </p>
      </header>
      ${
        scopeUpgrade
          ? `<div class="banner banner-warn">
              Updated permissions are required (Discover Daily). Click Connect below and approve <strong>all</strong> access on the Spotify screen.
            </div>`
          : ''
      }
      ${
        missingConfig
          ? `<div class="banner banner-warn">
              Add <code>VITE_SPOTIFY_CLIENT_ID</code> to <code>.env</code>.
              See <code>README.md</code> for setup.
            </div>`
          : ''
      }
      <button class="btn-spotify" id="login-btn" ${missingConfig ? 'disabled' : ''}>
        Connect with Spotify
      </button>
    </div>
  `

  if (!missingConfig) {
    document.getElementById('login-btn')!.addEventListener('click', () => {
      loginWithSpotify().catch(showError)
    })
  }
}

function activePlaylists(): SpotifyPlaylist[] {
  return playlists.filter((p) => !isArchived(libraryPrefs, p.id))
}

function statsHtml(items: SpotifyPlaylist[]): string {
  const counts = { yours: 0, collaborative: 0, followed: 0 }
  for (const p of items) {
    if (isArchived(libraryPrefs, p.id)) continue
    counts[classifyPlaylist(p, userId)] += 1
  }
  return `
    <div class="stats">
      <div class="stat"><span class="stat-value">${items.length}</span><span class="stat-label">Total</span></div>
      <div class="stat"><span class="stat-value">${counts.yours}</span><span class="stat-label">Yours</span></div>
      <div class="stat"><span class="stat-value">${counts.collaborative}</span><span class="stat-label">Collaborative</span></div>
      <div class="stat"><span class="stat-value">${counts.followed}</span><span class="stat-label">Followed</span></div>
    </div>
  `
}

function matchesSearch(p: SpotifyPlaylist): boolean {
  if (!searchQuery) return true
  const q = searchQuery.toLowerCase()
  return (
    p.name.toLowerCase().includes(q) ||
    (p.owner?.display_name ?? p.owner?.id ?? '').toLowerCase().includes(q)
  )
}

function filteredPlaylists(): SpotifyPlaylist[] {
  return playlists.filter((p) => {
    const archived = isArchived(libraryPrefs, p.id)
    const q = searchQuery.trim()

    if (activeFilter === 'archived') {
      if (!archived) return false
      return matchesSearch(p)
    }

    if (archived) {
      if (!q) return false
      if (!matchesSearch(p)) return false
    }

    const kind = classifyPlaylist(p, userId)
    if (activeFilter !== 'all' && kind !== activeFilter) return false
    return matchesSearch(p)
  })
}

function ownerName(p: SpotifyPlaylist): string {
  return p.owner?.display_name ?? p.owner?.id ?? ''
}

function sortPlaylists(items: SpotifyPlaylist[]): SpotifyPlaylist[] {
  if (playlistSortMode === 'library') return items
  if (playlistSortMode === 'custom' || playlistSortMode === 'grouped') {
    return applyCustomSort(items, libraryPrefs)
  }

  const libraryIndex = new Map(playlists.map((p, i) => [p.id, i]))
  const kindRank: Record<PlaylistKind, number> = {
    yours: 0,
    collaborative: 1,
    followed: 2,
  }
  const publicRank = (p: SpotifyPlaylist) =>
    p.public === true ? 0 : p.public === false ? 1 : 2

  const sorted = [...items]
  sorted.sort((a, b) => {
    switch (playlistSortMode) {
      case 'library':
        return (libraryIndex.get(a.id) ?? 0) - (libraryIndex.get(b.id) ?? 0)
      case 'name_asc':
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      case 'name_desc':
        return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' })
      case 'tracks_desc':
        return b.tracks.total - a.tracks.total
      case 'tracks_asc':
        return a.tracks.total - b.tracks.total
      case 'owner_asc':
        return ownerName(a).localeCompare(ownerName(b), undefined, {
          sensitivity: 'base',
        })
      case 'owner_desc':
        return ownerName(b).localeCompare(ownerName(a), undefined, {
          sensitivity: 'base',
        })
      case 'kind': {
        const ka = kindRank[classifyPlaylist(a, userId)]
        const kb = kindRank[classifyPlaylist(b, userId)]
        if (ka !== kb) return ka - kb
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      }
      case 'public_first': {
        const diff = publicRank(a) - publicRank(b)
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      }
      case 'collaborative_first': {
        const ca = a.collaborative ? 0 : 1
        const cb = b.collaborative ? 0 : 1
        if (ca !== cb) return ca - cb
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      }
      default:
        return 0
    }
  })
  return sorted
}

function playlistSortMenuHtml(): string {
  const activeLabel =
    PLAYLIST_SORT_OPTIONS.find((o) => o.mode === playlistSortMode)?.label ??
    'Spotify library order'

  return `
    <div class="detail-sort" data-sort-open="false">
      <button
        type="button"
        class="detail-sort-trigger"
        id="playlist-sort-trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <span class="detail-sort-label">${escapeHtml(activeLabel)}</span>
        <span class="detail-sort-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="detail-sort-menu" role="listbox" aria-label="Sort playlists" hidden>
        ${PLAYLIST_SORT_OPTIONS.map(
          (opt) => `
          <button
            type="button"
            class="detail-sort-option ${opt.mode === playlistSortMode ? 'is-active' : ''}"
            role="option"
            aria-selected="${opt.mode === playlistSortMode}"
            data-playlist-sort="${opt.mode}"
          >
            <span class="detail-sort-check" aria-hidden="true">${opt.mode === playlistSortMode ? '✓' : ''}</span>
            <span>${escapeHtml(opt.label)}</span>
          </button>
        `
        ).join('')}
      </div>
      </div>
  `
}

function playlistGridSizeControlsHtml(): string {
  const atMin = playlistGridMin <= PLAYLIST_GRID_MIN
  const atMax = playlistGridMin >= PLAYLIST_GRID_MAX

  return `
    <div class="grid-size-control" aria-label="Grid size">
      <button
        type="button"
        class="grid-size-btn"
        id="playlist-grid-size-dec"
        aria-label="More playlists per row"
        ${atMin ? 'disabled' : ''}
      >−</button>
      <span class="grid-size-label" aria-hidden="true">${playlistGridMin}px</span>
      <button
        type="button"
        class="grid-size-btn"
        id="playlist-grid-size-inc"
        aria-label="Fewer playlists per row"
        ${atMax ? 'disabled' : ''}
      >+</button>
    </div>
  `
}

function usesGroupedLayout(): boolean {
  return (
    playlistSortMode === 'grouped' ||
    (playlistSortMode === 'custom' && libraryPrefs.groups.length > 0)
  )
}

function libraryBodyHtml(items: SpotifyPlaylist[]): string {
  if (items.length === 0) {
    return '<p class="empty">No playlists match your filters.</p>'
  }
  const showMenu = true
  const draggable = playlistSortMode === 'custom'
  if (usesGroupedLayout()) {
    return `<div class="playlist-library">${renderGroupedLibrary(items, libraryPrefs, playlistCard, {
      draggable,
      showMenu,
    })}</div>`
  }
  return `<div class="grid" style="--playlist-grid-min: ${playlistGridMin}px">${renderFlatGrid(
    items,
    playlistCard,
    { draggable, showMenu, archived: false }
  )}</div>`
}

function playlistCard(p: SpotifyPlaylist): string {
  const kind = classifyPlaylist(p, userId)
  const cover = renderImg({
    images: p.images,
    targetWidth: IMAGE_SIZES.card,
    width: 300,
    height: 300,
    alt: p.name,
    loading: 'lazy',
    sizes: '(max-width: 600px) 50vw, 280px',
  })
  const owner = p.owner?.display_name ?? p.owner?.id ?? 'Unknown'
  const visibility =
    p.public === null ? '—' : p.public ? 'Public' : 'Private'

  return `
    <button type="button" class="card" data-playlist-id="${p.id}">
      <div class="card-art">
        ${cover || `<span class="card-placeholder">♪</span>`}
      </div>
      <div class="card-body">
        <span class="badge badge-${kind}">${formatKind(kind)}</span>
        <h3>${escapeHtml(p.name)}</h3>
        <p class="card-meta">${escapeHtml(owner)} · ${p.tracks.total} tracks · ${visibility}</p>
        ${
          p.description
            ? `<p class="card-desc">${escapeHtml(p.description)}</p>`
            : ''
        }
      </div>
    </button>
  `
}

function openDiscover(): void {
  currentView = 'discover'
  void renderDiscoverView(
    app,
    userId,
    userMarket,
    () => {
      currentView = 'dashboard'
      renderDashboard()
    },
    (playlistId) => {
      currentView = 'detail'
      openPlaylist(playlistId)
    }
  )
}

async function openPlaylist(playlistId: string): Promise<void> {
  let playlist = playlists.find((p) => p.id === playlistId)
  if (!playlist) {
    showLoading('Loading playlist…')
    try {
      playlist = await spotifyFetch<SpotifyPlaylist>(`/playlists/${playlistId}`)
      if (!playlists.some((p) => p.id === playlist!.id)) {
        playlists = [playlist, ...playlists]
        syncLibraryPrefs()
      }
      if (userId) {
        setCachedPlaylists(userId, playlists)
        upsertCachedPlaylist(playlist, userId)
      }
    } catch (e) {
      if (currentView === 'discover') openDiscover()
      else renderDashboard()
      showError(e)
      return
    }
  }

  currentView = 'detail'

  const cachedEntries = getCachedPlaylistEntries(playlistId, userMarket)
  if (cachedEntries) {
    renderPlaylistDetail(
      app,
      playlist,
      cachedEntries,
      classifyPlaylist(playlist, userId),
      userMarket,
      () => {
        currentView = 'dashboard'
        renderDashboard()
      },
      (updated) => setCachedEntries(playlistId, userMarket, updated)
    )
    return
  }

  showLoading(`Loading “${playlist.name}”…`)

  try {
    const entries = await getPlaylistTrackEntries(playlistId, userMarket)
    setCachedEntries(playlistId, userMarket, entries)
    renderPlaylistDetail(
      app,
      playlist,
      entries,
      classifyPlaylist(playlist, userId),
      userMarket,
      () => {
        currentView = 'dashboard'
        renderDashboard()
      },
      (updated) => setCachedEntries(playlistId, userMarket, updated)
    )
  } catch (e) {
    currentView = 'dashboard'
    renderDashboard()
    showError(e)
  }
}

async function loadPlaylists(force = false): Promise<void> {
  if (!force) {
    const cached = getCachedPlaylists(userId)
    if (cached) {
      playlists = cached
      syncLibraryPrefs()
      return
    }
  }

  playlists = await getAllPlaylists()
  setCachedPlaylists(userId, playlists)
  syncLibraryPrefs()
}

async function refreshPlaylists(): Promise<void> {
  if (playlistsRefreshing) return
  playlistsRefreshing = true
  if (currentView === 'dashboard') renderDashboard()

  try {
    clearPlaylistCache()
    await loadPlaylists(true)
  } catch (e) {
    showError(e)
  } finally {
    playlistsRefreshing = false
    if (currentView === 'dashboard') renderDashboard()
  }
}

function setPlaylistSortMenuOpen(root: HTMLElement, open: boolean): void {
  const wrap = root.querySelector<HTMLElement>('.detail-sort')
  const trigger = root.querySelector<HTMLButtonElement>('#playlist-sort-trigger')
  const menu = root.querySelector<HTMLElement>('.detail-sort-menu')
  if (!wrap || !trigger || !menu) return
  wrap.dataset.sortOpen = open ? 'true' : 'false'
  trigger.setAttribute('aria-expanded', String(open))
  menu.hidden = !open
}

function bindPlaylistLibrary(root: HTMLElement): void {
  bindLibraryDashboard({
    root,
    prefs: libraryPrefs,
    onPrefsChange: setLibraryPrefs,
    groups: libraryPrefs.groups,
    customOrderMode: playlistSortMode === 'custom',
    openPlaylist: (id) => void openPlaylist(id),
    cardSelector: '.card[data-playlist-id]',
  })
}

function updateDashboardResults(): void {
  renderDashboard()
}

function bindPlaylistSortMenu(root: HTMLElement): void {
  const trigger = root.querySelector<HTMLButtonElement>('#playlist-sort-trigger')
  const menu = root.querySelector<HTMLElement>('.detail-sort-menu')
  if (!trigger || !menu) return

  const close = () => setPlaylistSortMenuOpen(root, false)

  trigger.addEventListener('click', (e) => {
    e.stopPropagation()
    const open =
      root.querySelector<HTMLElement>('.detail-sort')?.dataset.sortOpen !== 'true'
    setPlaylistSortMenuOpen(root, open)
    if (open) {
      setTimeout(() => {
        document.addEventListener('click', close, { once: true })
      }, 0)
    }
  })

  menu.querySelectorAll<HTMLButtonElement>('[data-playlist-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.playlistSort as PlaylistSortMode | undefined
      if (!mode || mode === playlistSortMode) {
        close()
        return
      }
      playlistSortMode = mode
      localStorage.setItem(PLAYLIST_SORT_STORAGE_KEY, playlistSortMode)
      close()
      renderDashboard()
    })
  })
}

function renderDashboard(): void {
  currentView = 'dashboard'
  const visible = sortPlaylists(filteredPlaylists())

  app.innerHTML = `
    <div class="shell dashboard-shell">
      <header class="topbar">
        <div class="brand">
          <p class="eyebrow">Niche</p>
          <h1>Playlist dashboard</h1>
        </div>
        <div class="user-chip">
          ${
            renderImg({
              images: userImages,
              targetWidth: 80,
              width: 40,
              height: 40,
              alt: displayName,
              className: 'avatar',
              loading: 'eager',
              fetchPriority: 'high',
              sizes: '40px',
            })
          }
          <span>${escapeHtml(displayName)}</span>
          <button class="btn-ghost" id="logout-btn" type="button">Disconnect</button>
        </div>
      </header>

      <div class="nav-tabs">
        <button type="button" class="nav-tab active" disabled>Playlists</button>
        <button type="button" class="nav-tab" id="discover-tab">Discover Daily</button>
      </div>

      ${statsHtml(activePlaylists())}

      <div class="toolbar">
        <input
          type="search"
          id="search"
          placeholder="Search playlists or owners…"
          value="${escapeHtml(searchQuery)}"
        />
        <button
          type="button"
          class="btn-refresh"
          id="refresh-playlists-btn"
          ${playlistsRefreshing ? 'disabled' : ''}
          aria-busy="${playlistsRefreshing}"
          title="Fetch latest playlists from Spotify"
        >
          ${playlistsRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <div class="filters" role="tablist">
          ${(['all', 'yours', 'collaborative', 'followed', 'archived'] as const)
            .map(
              (f) => `
            <button
              type="button"
              class="filter-btn ${activeFilter === f ? 'active' : ''}"
              data-filter="${f}"
            >${
              f === 'all'
                ? 'All'
                : f === 'archived'
                  ? 'Archived'
                  : formatKind(f)
            }</button>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="results-row">
        <p class="results-count">${visible.length} playlist${visible.length === 1 ? '' : 's'}</p>
        <div class="results-actions">
          ${playlistSortMode === 'custom' ? '<span class="library-order-hint">Drag cards to reorder</span>' : ''}
          <button type="button" class="btn-ghost" id="manage-groups-btn">Groups</button>
          ${playlistSortMenuHtml()}
          ${playlistGridSizeControlsHtml()}
        </div>
      </div>

      <div class="playlist-library-root" style="--playlist-grid-min: ${playlistGridMin}px">
        ${libraryBodyHtml(visible)}
      </div>
      ${showGroupsModal ? manageGroupsModalHtml() : ''}
    </div>
  `

  document.getElementById('discover-tab')!.addEventListener('click', () => {
    openDiscover()
  })

  document.getElementById('logout-btn')!.addEventListener('click', () => {
    clearAuth()
    clearPlaylistCache()
    unmountCartUI()
    playlists = []
    userImages = null
    renderLogin(!isConfigured())
  })

  document.getElementById('refresh-playlists-btn')?.addEventListener('click', () => {
    void refreshPlaylists()
  })

  document.getElementById('search')!.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value
    updateDashboardResults()
  })

  document.querySelectorAll<HTMLButtonElement>('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter as Filter
      localStorage.setItem(PLAYLIST_FILTER_STORAGE_KEY, activeFilter)
      renderDashboard()
    })
  })

  const applyGridSize = (delta: number) => {
    const next = Math.min(
      PLAYLIST_GRID_MAX,
      Math.max(PLAYLIST_GRID_MIN, playlistGridMin + delta)
    )
    if (next === playlistGridMin) return
    playlistGridMin = next
    localStorage.setItem(PLAYLIST_GRID_STORAGE_KEY, String(playlistGridMin))
    renderDashboard()
  }

  document
    .getElementById('playlist-grid-size-dec')
    ?.addEventListener('click', () => applyGridSize(-PLAYLIST_GRID_STEP))
  document
    .getElementById('playlist-grid-size-inc')
    ?.addEventListener('click', () => applyGridSize(PLAYLIST_GRID_STEP))

  bindPlaylistSortMenu(app)

  bindPlaylistLibrary(app)

  document.getElementById('manage-groups-btn')?.addEventListener('click', () => {
    showGroupsModal = true
    renderDashboard()
  })

  if (showGroupsModal) {
    bindManageGroupsModal(app, libraryPrefs, setLibraryPrefs, () => {
      showGroupsModal = false
      renderDashboard()
    })
  }
}

function showError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  const banner = document.createElement('div')
  banner.className = 'banner banner-error'
  banner.textContent = message
  app.prepend(banner)
}

function showLoading(label: string): void {
  app.innerHTML = `
    <div class="shell loading-shell">
      <div class="spinner" aria-hidden="true"></div>
      <p>${escapeHtml(label)}</p>
    </div>
  `
}

async function boot(): Promise<void> {
  if (!isConfigured()) {
    renderLogin(true)
    return
  }

  const onCallback = window.location.pathname.endsWith('/callback')

  if (onCallback) {
    showLoading('Connecting to Spotify…')
    try {
      await handleAuthCallback()
    } catch (e) {
      renderLogin(false)
      showError(e)
      return
    }
    window.location.replace('/')
    return
  }

  if (!getStoredTokens()) {
    renderLogin(false)
    return
  }

  if (needsReauth()) {
    clearAuth()
    renderLogin(false, true)
    return
  }

  try {
    const user = await getCurrentUser()
    userId = user.id
    displayName = user.display_name ?? user.id
    userImages = user.images
    userMarket = user.country ?? 'US'
    libraryPrefs = loadLibraryPrefs(userId)

    mountCartUI({
      getPlaylists: () => playlists,
      userId,
      market: userMarket,
      onPlaylistsChanged: async () => {
        await loadPlaylists(true)
        if (currentView === 'dashboard') renderDashboard()
      },
      openPlaylist: (id) => void openPlaylist(id),
    })

    const cached = getCachedPlaylists(userId)
    if (cached) {
      playlists = cached
      syncLibraryPrefs()
      renderDashboard()
    } else {
      showLoading('Loading your playlists…')
      await loadPlaylists()
      renderDashboard()
    }
  } catch (e) {
    clearAuth()
    renderLogin(false)
    showError(e)
  }
}

boot()
