import { getSavedAlbumsDeep, spotifyErrorMessage } from '../spotify/api'
import { getCachedSavedAlbums, setCachedSavedAlbums } from './albumsCache'
import {
  ALBUM_SORT_OPTIONS,
  filterAlbums,
  sortAlbums,
  type AlbumSortMode,
  type AlbumTypeFilter,
} from './albumsSort'
import { albumArtistLabel, albumYear } from './albumIdentity'
import { IMAGE_SIZES, renderImg } from '../spotify/images'
import { escapeHtml } from '../listening/shared'
import type { SavedAlbumItem } from '../spotify/types'

const ALBUM_FILTERS: { id: AlbumTypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'album', label: 'Albums' },
  { id: 'single', label: 'Singles' },
  { id: 'compilation', label: 'Compilations' },
]

const ALBUM_TYPE_LABELS: Record<string, string> = {
  album: 'Album',
  single: 'Single',
  compilation: 'Compilation',
}

const SORT_KEY = 'niche_albums_sort'
const FILTER_KEY = 'niche_albums_filter'
const SEARCH_KEY = 'niche_albums_search'
const GRID_KEY = 'niche_albums_grid_min'
const GRID_MIN = 140
const GRID_MAX = 360
const GRID_STEP = 24

export interface AlbumsViewOpts {
  market: string
  onBack: () => void
  onOpenAlbum: (albumId: string) => void
}

type AlbumsPrefs = {
  sort: AlbumSortMode
  filter: AlbumTypeFilter
  search: string
  gridMin: number
}

const SORT_MODES = new Set<AlbumSortMode>(ALBUM_SORT_OPTIONS.map((o) => o.mode))
const FILTER_MODES = new Set<AlbumTypeFilter>(ALBUM_FILTERS.map((f) => f.id))

function loadPrefs(): AlbumsPrefs {
  const sortRaw = localStorage.getItem(SORT_KEY)
  const filterRaw = localStorage.getItem(FILTER_KEY)
  const gridStored = localStorage.getItem(GRID_KEY)
  const gridRaw = gridStored === null ? NaN : Number(gridStored)
  return {
    sort: SORT_MODES.has(sortRaw as AlbumSortMode)
      ? (sortRaw as AlbumSortMode)
      : 'added_desc',
    filter: FILTER_MODES.has(filterRaw as AlbumTypeFilter)
      ? (filterRaw as AlbumTypeFilter)
      : 'all',
    search: localStorage.getItem(SEARCH_KEY) ?? '',
    gridMin: Number.isFinite(gridRaw)
      ? Math.min(GRID_MAX, Math.max(GRID_MIN, Math.round(gridRaw)))
      : 220,
  }
}

function savePrefs(): void {
  localStorage.setItem(SORT_KEY, prefs.sort)
  localStorage.setItem(FILTER_KEY, prefs.filter)
  localStorage.setItem(SEARCH_KEY, prefs.search)
  localStorage.setItem(GRID_KEY, String(prefs.gridMin))
}

let rootEl: HTMLElement | null = null
let viewOpts: AlbumsViewOpts | null = null
let albums: SavedAlbumItem[] = []
let loading = false
let error: string | null = null
let generation = 0
let prefs: AlbumsPrefs = loadPrefs()

function albumCard(item: SavedAlbumItem): string {
  const album = item.album
  const cover = renderImg({
    images: album.images,
    targetWidth: IMAGE_SIZES.card,
    width: 300,
    height: 300,
    alt: album.name,
    loading: 'lazy',
    sizes: '(max-width: 600px) 50vw, 240px',
  })
  const typeLabel = ALBUM_TYPE_LABELS[album.album_type] ?? 'Album'
  const trackCount = album.total_tracks

  return `
    <button type="button" class="card album-card" data-album-id="${album.id}">
      <div class="card-art">
        ${cover || `<span class="card-placeholder">♪</span>`}
      </div>
      <div class="card-body">
        <span class="badge badge-album">${typeLabel}</span>
        <h3>${escapeHtml(album.name)}</h3>
        <p class="card-meta">${escapeHtml(albumArtistLabel(album))}</p>
        <p class="card-meta album-card-sub">${albumYear(album)} · ${trackCount} track${trackCount === 1 ? '' : 's'}</p>
      </div>
    </button>
  `
}

function resultsBodyHtml(): string {
  if (!albums.length) {
    if (error) {
      return `
        <p class="empty">${escapeHtml(error)}</p>
        <p class="albums-retry-wrap"><button type="button" class="btn-ghost" id="albums-retry">Try again</button></p>
      `
    }
    if (loading) {
      return '<p class="empty" id="albums-loading">Loading albums… <span id="albums-progress"></span></p>'
    }
    return '<p class="empty">No saved albums yet. Save albums in Spotify, then hit Refresh.</p>'
  }

  const visible = sortAlbums(
    filterAlbums(albums, prefs.search, prefs.filter),
    prefs.sort
  )
  const errorBanner = error
    ? `<p class="albums-error">${escapeHtml(error)}</p>`
    : ''

  if (!visible.length) {
    return `${errorBanner}<p class="empty">No albums match your filters.</p>`
  }

  return `
    ${errorBanner}
    <div class="grid" style="--playlist-grid-min: ${prefs.gridMin}px">
      ${visible.map(albumCard).join('')}
    </div>
  `
}

function visibleCount(): number {
  return sortAlbums(filterAlbums(albums, prefs.search, prefs.filter), prefs.sort)
    .length
}

function sortMenuHtml(): string {
  const activeLabel =
    ALBUM_SORT_OPTIONS.find((o) => o.mode === prefs.sort)?.label ?? 'Sort'
  return `
    <div class="detail-sort albums-sort" data-sort-open="false">
      <button type="button" class="detail-sort-trigger" id="albums-sort-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="detail-sort-label">${escapeHtml(activeLabel)}</span>
        <span class="detail-sort-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="detail-sort-menu" role="listbox" aria-label="Sort albums" hidden>
        ${ALBUM_SORT_OPTIONS.map(
          (opt) => `
          <button
            type="button"
            class="detail-sort-option ${opt.mode === prefs.sort ? 'is-active' : ''}"
            role="option"
            aria-selected="${opt.mode === prefs.sort}"
            data-album-sort="${opt.mode}"
          >
            <span class="detail-sort-check" aria-hidden="true">${opt.mode === prefs.sort ? '✓' : ''}</span>
            <span>${escapeHtml(opt.label)}</span>
          </button>
        `
        ).join('')}
      </div>
    </div>
  `
}

function gridSizeControlsHtml(): string {
  const atMin = prefs.gridMin <= GRID_MIN
  const atMax = prefs.gridMin >= GRID_MAX
  return `
    <div class="grid-size-control" aria-label="Grid size">
      <button
        type="button"
        class="grid-size-btn"
        id="albums-grid-dec"
        aria-label="More albums per row"
        ${atMin ? 'disabled' : ''}
      >−</button>
      <span class="grid-size-label" aria-hidden="true">${prefs.gridMin}px</span>
      <button
        type="button"
        class="grid-size-btn"
        id="albums-grid-inc"
        aria-label="Fewer albums per row"
        ${atMax ? 'disabled' : ''}
      >+</button>
    </div>
  `
}

function albumsSubLabel(): string {
  if (loading && !albums.length) return 'Loading your library…'
  return `${albums.length} saved album${albums.length === 1 ? '' : 's'}`
}

function setSortMenuOpen(open: boolean): void {
  const root = rootEl
  if (!root) return
  const wrap = root.querySelector<HTMLElement>('.albums-sort')
  const trigger = root.querySelector<HTMLElement>('#albums-sort-trigger')
  const menu = root.querySelector<HTMLElement>('.detail-sort-menu')
  if (!wrap || !trigger || !menu) return
  wrap.dataset.sortOpen = open ? 'true' : 'false'
  trigger.setAttribute('aria-expanded', String(open))
  menu.hidden = !open
}

function bind(): void {
  const root = rootEl
  if (!root || !viewOpts) return

  root.querySelector<HTMLButtonElement>('#albums-back')?.addEventListener('click', () => {
    const onBack = viewOpts?.onBack
    disposeAlbumsView()
    onBack?.()
  })

  root.querySelector<HTMLInputElement>('#albums-search')?.addEventListener('input', (e) => {
    prefs.search = (e.target as HTMLInputElement).value
    savePrefs()
    paintResults()
  })

  root.querySelector<HTMLButtonElement>('#albums-refresh')?.addEventListener('click', () => {
    void loadAlbums(generation)
  })

  root.querySelectorAll<HTMLButtonElement>('[data-album-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.albumFilter as AlbumTypeFilter | undefined
      if (!next || next === prefs.filter) return
      prefs.filter = next
      savePrefs()
      paint()
    })
  })

  const trigger = root.querySelector<HTMLElement>('#albums-sort-trigger')
  trigger?.addEventListener('click', (e) => {
    e.stopPropagation()
    const open = root.querySelector<HTMLElement>('.albums-sort')?.dataset.sortOpen !== 'true'
    setSortMenuOpen(open)
    if (open) {
      setTimeout(() => {
        document.addEventListener('click', () => setSortMenuOpen(false), { once: true })
      }, 0)
    }
  })

  root.querySelectorAll<HTMLButtonElement>('[data-album-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.albumSort as AlbumSortMode | undefined
      if (!mode) return
      prefs.sort = mode
      savePrefs()
      setSortMenuOpen(false)
      paint()
    })
  })

  root.querySelector<HTMLButtonElement>('#albums-grid-dec')?.addEventListener('click', () => {
    applyGridSize(-GRID_STEP)
  })
  root.querySelector<HTMLButtonElement>('#albums-grid-inc')?.addEventListener('click', () => {
    applyGridSize(GRID_STEP)
  })

  root.querySelector<HTMLElement>('#albums-results')?.addEventListener('click', (e) => {
    const target = e.target
    if (!(target instanceof Element)) return
    if (target.closest('#albums-retry')) {
      void loadAlbums(generation)
      return
    }
    const card = target.closest<HTMLButtonElement>('[data-album-id]')
    if (card?.dataset.albumId) viewOpts?.onOpenAlbum(card.dataset.albumId)
  })
}

function applyGridSize(delta: number): void {
  const next = Math.min(GRID_MAX, Math.max(GRID_MIN, prefs.gridMin + delta))
  if (next === prefs.gridMin) return
  prefs.gridMin = next
  savePrefs()
  paint()
}

function paint(): void {
  const root = rootEl
  if (!root || !viewOpts) return

  root.innerHTML = `
    <div class="shell albums-shell">
      <button type="button" class="btn-back" id="albums-back">← Back to playlists</button>

      <header class="stats-header">
        <h1 class="stats-title">Albums</h1>
        <p class="albums-sub">${albumsSubLabel()}</p>
      </header>

      <div class="toolbar">
        <div class="toolbar-search">
          <input
            type="search"
            id="albums-search"
            placeholder="Search albums or artists…"
            value="${escapeHtml(prefs.search)}"
          />
          <button
            type="button"
            class="btn-refresh"
            id="albums-refresh"
            ${loading ? 'disabled' : ''}
            aria-busy="${loading}"
            title="Fetch your latest saved albums from Spotify"
          >${loading && albums.length ? 'Refreshing…' : 'Refresh'}</button>
        </div>
        <div class="filters" role="tablist">
          ${ALBUM_FILTERS.map(
            (f) => `
            <button
              type="button"
              class="filter-btn ${prefs.filter === f.id ? 'active' : ''}"
              data-album-filter="${f.id}"
            >${f.label}</button>
          `
          ).join('')}
        </div>
      </div>

      <div class="results-row">
        <p class="results-count" id="albums-results-count"></p>
        <div class="results-actions">
          ${sortMenuHtml()}
          ${gridSizeControlsHtml()}
        </div>
      </div>

      <div id="albums-results">${resultsBodyHtml()}</div>
    </div>
  `

  bind()
  paintResults()
}

function paintResults(): void {
  const root = rootEl
  if (!root) return

  const countEl = root.querySelector<HTMLElement>('#albums-results-count')
  if (countEl) {
    const n = visibleCount()
    countEl.textContent =
      loading && !albums.length ? '' : `${n} album${n === 1 ? '' : 's'}`
  }
  const resultsEl = root.querySelector<HTMLElement>('#albums-results')
  if (resultsEl) resultsEl.innerHTML = resultsBodyHtml()
}

/** Update toolbar + results in place, preserving scroll position. */
function updateChrome(): void {
  const root = rootEl
  if (!root) return
  const sub = root.querySelector<HTMLElement>('.albums-sub')
  if (sub) sub.textContent = albumsSubLabel()
  const refresh = root.querySelector<HTMLButtonElement>('#albums-refresh')
  if (refresh) {
    refresh.disabled = loading
    refresh.setAttribute('aria-busy', String(loading))
    refresh.textContent = loading && albums.length ? 'Refreshing…' : 'Refresh'
  }
  paintResults()
}

async function loadAlbums(gen: number): Promise<void> {
  if (gen !== generation || !viewOpts) return

  const hadAlbums = albums.length > 0
  loading = true
  error = null
  if (hadAlbums) updateChrome()
  else paint()

  try {
    const items = await getSavedAlbumsDeep(viewOpts.market, (loaded, total) => {
      if (gen !== generation) return
      const el = document.getElementById('albums-progress')
      if (el) el.textContent = `${loaded} / ${total}`
    })
    if (gen !== generation) return
    albums = items
    setCachedSavedAlbums(items)
    loading = false
    updateChrome()
  } catch (err) {
    if (gen !== generation) return
    loading = false
    error = spotifyErrorMessage(err)
    updateChrome()
  }
}

/** Invalidate any in-flight load — call before navigating away. */
export function disposeAlbumsView(): void {
  generation += 1
  rootEl = null
  viewOpts = null
}

export function renderAlbumsView(
  root: HTMLElement,
  opts: AlbumsViewOpts
): void {
  rootEl = root
  viewOpts = opts
  generation += 1
  prefs = loadPrefs()

  const cached = getCachedSavedAlbums()
  if (cached) {
    albums = cached
    loading = false
    error = null
    paint()
    return
  }

  albums = []
  loading = true
  error = null
  void loadAlbums(generation)
}
