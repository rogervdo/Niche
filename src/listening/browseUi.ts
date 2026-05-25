import { isInCart } from '../cart/cart'
import { bindTrackDragSource, setCartTrackResolver, updateCartButtons } from '../cart/ui'
import {
  bindPreviewSettings,
  previewSettingsControlsHtml,
} from '../playlist/gridPreviewSettings'
import {
  playPreview,
  stopPreview,
  unlockPreviewAudio,
  getPreviewError,
  isPreviewPlaying,
} from '../playlist/previewPlayer'
import { startPreviewVisualizer, stopPreviewVisualizer } from '../playlist/previewVisualizer'
import { isVisualizerEnabled } from '../playlist/previewVisualizerTuning'
import { IMAGE_SIZES, renderImg } from '../spotify/images'
import type { SpotifyTrack } from '../spotify/types'
import { resolvePreviewUrl } from '../spotify/preview'
import { iconCheck, iconGrid, iconList, iconPlus } from '../ui/icons'
import type { ListeningItem } from './items'
import { escapeHtml, formatPlayedAt, spotifyLinkHtml } from './shared'

export type BrowseViewMode = 'list' | 'grid'

export type ListeningSortMode =
  | 'rank'
  | 'name'
  | 'name_desc'
  | 'artist'
  | 'played_newest'
  | 'played_oldest'
  | 'popularity'
  | 'popularity_desc'

export type BrowsePrefs = {
  viewMode: BrowseViewMode
  sortMode: ListeningSortMode
  gridCellSize: number
  searchQuery: string
  selectedId: string | null
}

const GRID_SIZE_MIN = 80
const GRID_SIZE_MAX = 220
const GRID_SIZE_STEP = 16
const GRID_SIZE_STORAGE_KEY = 'niche_grid_cell_size'

export type SortOption = { mode: ListeningSortMode; label: string }

export const RECENT_SORT_OPTIONS: SortOption[] = [
  { mode: 'played_newest', label: 'Played (newest first)' },
  { mode: 'played_oldest', label: 'Played (oldest first)' },
  { mode: 'rank', label: 'Original order' },
  { mode: 'name', label: 'Track name (A–Z)' },
  { mode: 'name_desc', label: 'Track name (Z–A)' },
  { mode: 'artist', label: 'Artist (A–Z)' },
  { mode: 'popularity_desc', label: 'Popularity (high to low)' },
  { mode: 'popularity', label: 'Popularity (low to high)' },
]

export const TOP_TRACK_SORT_OPTIONS: SortOption[] = [
  { mode: 'rank', label: 'Spotify rank' },
  { mode: 'name', label: 'Track name (A–Z)' },
  { mode: 'name_desc', label: 'Track name (Z–A)' },
  { mode: 'artist', label: 'Artist (A–Z)' },
  { mode: 'popularity_desc', label: 'Popularity (high to low)' },
  { mode: 'popularity', label: 'Popularity (low to high)' },
]

export const TOP_ARTIST_SORT_OPTIONS: SortOption[] = [
  { mode: 'rank', label: 'Spotify rank' },
  { mode: 'name', label: 'Artist name (A–Z)' },
  { mode: 'name_desc', label: 'Artist name (Z–A)' },
]

export const TOP_GENRE_SORT_OPTIONS: SortOption[] = [
  { mode: 'rank', label: 'Weight (high to low)' },
  { mode: 'name', label: 'Genre (A–Z)' },
  { mode: 'name_desc', label: 'Genre (Z–A)' },
]

function loadGridCellSize(): number {
  const raw = localStorage.getItem(GRID_SIZE_STORAGE_KEY)
  const n = raw ? Number(raw) : NaN
  if (!Number.isFinite(n)) return 120
  return Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, Math.round(n)))
}

function saveGridCellSize(size: number): void {
  localStorage.setItem(GRID_SIZE_STORAGE_KEY, String(size))
}

export function loadBrowsePrefs(
  storagePrefix: string,
  defaultSort: ListeningSortMode
): BrowsePrefs {
  const viewRaw = localStorage.getItem(`${storagePrefix}_view`)
  const sortRaw = localStorage.getItem(`${storagePrefix}_sort`)
  const searchRaw = localStorage.getItem(`${storagePrefix}_search`)
  const selectedRaw = localStorage.getItem(`${storagePrefix}_selected`)

  const sortModes = new Set([
    ...RECENT_SORT_OPTIONS,
    ...TOP_TRACK_SORT_OPTIONS,
    ...TOP_ARTIST_SORT_OPTIONS,
    ...TOP_GENRE_SORT_OPTIONS,
  ].map((o) => o.mode))

  return {
    viewMode: viewRaw === 'grid' ? 'grid' : 'list',
    sortMode:
      sortRaw && sortModes.has(sortRaw as ListeningSortMode)
        ? (sortRaw as ListeningSortMode)
        : defaultSort,
    gridCellSize: loadGridCellSize(),
    searchQuery: searchRaw ?? '',
    selectedId: selectedRaw || null,
  }
}

export function saveBrowsePrefs(storagePrefix: string, prefs: BrowsePrefs): void {
  localStorage.setItem(`${storagePrefix}_view`, prefs.viewMode)
  localStorage.setItem(`${storagePrefix}_sort`, prefs.sortMode)
  localStorage.setItem(`${storagePrefix}_search`, prefs.searchQuery)
  if (prefs.selectedId) {
    localStorage.setItem(`${storagePrefix}_selected`, prefs.selectedId)
  } else {
    localStorage.removeItem(`${storagePrefix}_selected`)
  }
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${String(s).padStart(2, '0')}`
}

function releaseYear(date?: string): string {
  if (!date) return ''
  return date.slice(0, 4)
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

export function sortListeningItems(
  items: ListeningItem[],
  mode: ListeningSortMode
): ListeningItem[] {
  const copy = [...items]
  switch (mode) {
    case 'rank':
      return copy.sort((a, b) => a.rank - b.rank)
    case 'name':
      return copy.sort((a, b) => compareText(a.name, b.name))
    case 'name_desc':
      return copy.sort((a, b) => compareText(b.name, a.name))
    case 'artist':
      return copy.sort((a, b) => compareText(a.subtitle, b.subtitle))
    case 'played_newest':
      return copy.sort((a, b) => {
        const at = a.playedAt ? Date.parse(a.playedAt) : 0
        const bt = b.playedAt ? Date.parse(b.playedAt) : 0
        return bt - at
      })
    case 'played_oldest':
      return copy.sort((a, b) => {
        const at = a.playedAt ? Date.parse(a.playedAt) : 0
        const bt = b.playedAt ? Date.parse(b.playedAt) : 0
        return at - bt
      })
    case 'popularity':
      return copy.sort(
        (a, b) =>
          (a.genreScore ?? a.popularity ?? 0) - (b.genreScore ?? b.popularity ?? 0) ||
          a.rank - b.rank
      )
    case 'popularity_desc':
      return copy.sort(
        (a, b) =>
          (b.genreScore ?? b.popularity ?? 0) - (a.genreScore ?? a.popularity ?? 0) ||
          a.rank - b.rank
      )
    default:
      return copy
  }
}

export function filterListeningItems(
  items: ListeningItem[],
  query: string
): ListeningItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)
  )
}

function gridSizeControlsHtml(prefs: BrowsePrefs): string {
  if (prefs.viewMode !== 'grid') return ''
  const atMin = prefs.gridCellSize <= GRID_SIZE_MIN
  const atMax = prefs.gridCellSize >= GRID_SIZE_MAX
  return `
    <div class="grid-size-control" aria-label="Grid size">
      <button type="button" class="grid-size-btn" data-grid-dec aria-label="Decrease grid size" ${atMin ? 'disabled' : ''}>−</button>
      <span class="grid-size-label" aria-hidden="true">${prefs.gridCellSize}px</span>
      <button type="button" class="grid-size-btn" data-grid-inc aria-label="Increase grid size" ${atMax ? 'disabled' : ''}>+</button>
    </div>
  `
}

function sortMenuHtml(prefs: BrowsePrefs, options: SortOption[]): string {
  const activeLabel =
    options.find((o) => o.mode === prefs.sortMode)?.label ?? options[0]?.label ?? 'Sort'
  return `
    <div class="detail-sort listening-sort" data-sort-open="false">
      <button type="button" class="detail-sort-trigger" data-sort-trigger aria-haspopup="listbox" aria-expanded="false">
        <span class="detail-sort-label">${escapeHtml(activeLabel)}</span>
        <span class="detail-sort-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="detail-sort-menu" role="listbox" aria-label="Sort" hidden>
        ${options
          .map(
            (opt) => `
          <button
            type="button"
            class="detail-sort-option ${opt.mode === prefs.sortMode ? 'is-active' : ''}"
            role="option"
            aria-selected="${opt.mode === prefs.sortMode}"
            data-sort="${opt.mode}"
          >
            <span class="detail-sort-check" aria-hidden="true">${opt.mode === prefs.sortMode ? '✓' : ''}</span>
            <span>${escapeHtml(opt.label)}</span>
          </button>
        `
          )
          .join('')}
      </div>
    </div>
  `
}

export function isGenreBarMode(items: ListeningItem[]): boolean {
  return items.length > 0 && items.every((i) => i.kind === 'genre')
}

function genreBarListHtml(items: ListeningItem[]): string {
  const maxScore = Math.max(...items.map((i) => i.genreScore ?? 0), 1)
  const rows = items
    .map((item, index) => {
      const pct = Math.max(4, Math.round(((item.genreScore ?? 0) / maxScore) * 100))
      return `
      <li class="genre-bar-row">
        <span class="genre-bar-rank">${index + 1}.</span>
        <div class="genre-bar-main">
          <span class="genre-bar-name">${escapeHtml(item.name)}</span>
          <div class="genre-bar-track" role="presentation" aria-hidden="true">
            <div class="genre-bar-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      </li>
    `
    })
    .join('')
  return `<ol class="genre-bar-list">${rows}</ol>`
}

export function listeningToolbarHtml(
  prefs: BrowsePrefs,
  sortOptions: SortOption[],
  searchPlaceholder: string,
  visibleCount: number,
  totalCount: number,
  genreBarMode = false
): string {
  const q = prefs.searchQuery.trim()
  const meta =
    q && visibleCount !== totalCount
      ? `<p class="detail-track-search-meta">${visibleCount} of ${totalCount}</p>`
      : ''

  const viewToggle = genreBarMode
    ? ''
    : `
        <div class="detail-view-toggle" role="tablist" aria-label="View mode">
          <button
            type="button"
            class="view-mode-btn btn-icon ${prefs.viewMode === 'list' ? 'active' : ''}"
            data-view-mode="list"
            role="tab"
            aria-selected="${prefs.viewMode === 'list'}"
            title="List view"
          >${iconList(18)}</button>
          <button
            type="button"
            class="view-mode-btn btn-icon ${prefs.viewMode === 'grid' ? 'active' : ''}"
            data-view-mode="grid"
            role="tab"
            aria-selected="${prefs.viewMode === 'grid'}"
            title="Grid view"
          >${iconGrid(18)}</button>
        </div>
      `

  return `
    <div class="listening-browse-toolbar detail-tracks-toolbar">
      <div class="detail-toolbar-leading">
        ${viewToggle}
        <div class="detail-track-search">
          <input
            type="search"
            class="detail-track-search-input"
            data-listening-search
            placeholder="${escapeHtml(searchPlaceholder)}"
            value="${escapeHtml(prefs.searchQuery)}"
            aria-label="${escapeHtml(searchPlaceholder)}"
          />
        </div>
      </div>
      <div class="detail-toolbar-actions">
        ${genreBarMode ? '' : gridSizeControlsHtml(prefs)}
        ${genreBarMode ? '' : previewSettingsControlsHtml()}
        ${sortMenuHtml(prefs, sortOptions)}
      </div>
    </div>
    ${meta}
  `
}

function addToCartButtonHtml(track: SpotifyTrack): string {
  const inCart = isInCart(track.id)
  return `
    <button
      type="button"
      class="btn-track-action btn-add-cart ${inCart ? 'in-cart' : ''}"
      data-track-id="${track.id}"
      title="${inCart ? 'Remove from cart' : 'Add to cart'}"
    >${inCart ? iconCheck(16) : iconPlus(16)}</button>
  `
}

function detailPanelHtml(
  item: ListeningItem | null,
  status: 'idle' | 'loading' | 'playing' | 'unavailable' | 'error' = 'idle',
  statusMessage?: string,
  pinned = false,
  gridMode = false
): string {
  if (!item) {
    const hint = gridMode
      ? 'Hover an album to preview'
      : 'Select a track to see details'
    return `
      <aside class="album-preview-panel album-preview-panel-empty listening-detail-panel">
        <p>${hint}</p>
      </aside>
    `
  }

  const art = renderImg({
    images: item.images,
    targetWidth: IMAGE_SIZES.detailCover,
    width: 280,
    height: 280,
    alt: item.name,
    loading: 'eager',
    sizes: '280px',
  })

  let statusText = pinned ? 'Selected' : gridMode ? 'Hover to preview' : 'Click to select'
  let statusClass = 'preview-status-muted'
  if (item.kind === 'track' && !gridMode) {
    statusText = pinned ? 'Selected' : 'Click to preview'
  }
  if (status === 'loading') {
    statusText = 'Loading preview…'
    statusClass = 'preview-status-loading'
  } else if (status === 'playing') {
    statusText = 'Playing preview…'
    statusClass = 'preview-status-playing'
  } else if (status === 'unavailable') {
    statusText =
      item.kind === 'track'
        ? 'No preview available for this track'
        : 'No preview available'
    statusClass = 'preview-status-muted'
  } else if (status === 'error') {
    statusText = statusMessage ?? 'Could not play preview'
    statusClass = 'preview-status-error'
  }

  const track = item.track
  const visualizerHtml =
    status === 'playing' && isVisualizerEnabled()
      ? `<canvas class="preview-visualizer" aria-hidden="true"></canvas>`
      : ''

  const statusRowHtml = visualizerHtml
    ? `<div class="preview-status-row"><p class="preview-status ${statusClass}">${escapeHtml(statusText)}</p>${visualizerHtml}</div>`
    : `<p class="preview-status ${statusClass}">${escapeHtml(statusText)}</p>`

  const extraMeta =
    item.kind === 'track' && track
      ? `<p class="preview-album">${escapeHtml(track.album.name)}${releaseYear(track.album.release_date) ? ` · ${escapeHtml(releaseYear(track.album.release_date))}` : ''} · ${formatDuration(track.duration_ms)}</p>`
      : item.kind === 'artist' && item.genres?.length
        ? `<p class="preview-album">${escapeHtml(item.genres.join(', '))}</p>`
        : ''

  const playedAt =
    item.playedAt
      ? `<p class="preview-popularity">Played ${escapeHtml(formatPlayedAt(item.playedAt))}</p>`
      : ''

  const popularity =
    item.popularity != null
      ? `<p class="preview-popularity">Popularity ${item.popularity}</p>`
      : ''

  const rankLine = `<p class="preview-popularity">Rank #${item.rank}</p>`

  const spotifyBtn = item.spotifyUrl
    ? `<a class="btn-open-spotify" href="${escapeHtml(item.spotifyUrl)}" target="_blank" rel="noreferrer">Open in Spotify</a>`
    : ''

  const cartBtn = track ? addToCartButtonHtml(track) : ''

  return `
    <aside class="album-preview-panel listening-detail-panel">
      <div class="preview-art-wrap">
        <div class="preview-art">
          ${art || `<span class="card-placeholder">${item.kind === 'genre' ? '#' : '♪'}</span>`}
        </div>
      </div>
      <div class="preview-meta">
        <h2 class="preview-track-name">${escapeHtml(item.name)}</h2>
        <p class="preview-artists">${escapeHtml(item.subtitle)}</p>
        ${extraMeta}
        ${rankLine}
        ${playedAt}
        ${popularity}
        ${statusRowHtml}
        <div class="preview-actions">
          ${cartBtn}
          ${spotifyBtn}
        </div>
      </div>
    </aside>
  `
}

function listRowHtml(item: ListeningItem, index: number, selected: boolean): string {
  const art = renderImg({
    images: item.images,
    targetWidth: IMAGE_SIZES.track,
    width: 40,
    height: 40,
    alt: item.name,
    loading: index < 12 ? 'eager' : 'lazy',
    sizes: '40px',
  })

  const timeCol =
    item.playedAt
      ? `<span class="track-added-at">${escapeHtml(formatPlayedAt(item.playedAt))}</span>`
      : item.track
        ? `<span class="track-duration">${formatDuration(item.track.duration_ms)}</span>`
        : ''

  return `
    <div
      class="track-row listening-track-row${selected ? ' listening-row-selected' : ''}"
      data-item-id="${escapeHtml(item.id)}"
      role="button"
      tabindex="0"
    >
      <span class="track-index">${item.rank}</span>
      <div class="track-open track-open-static">
        <div class="track-art">
          ${art || `<span class="track-art-placeholder">${item.kind === 'genre' ? '#' : '♪'}</span>`}
        </div>
        <div class="track-info">
          <span class="track-name">${escapeHtml(item.name)}</span>
          <span class="track-artists">${escapeHtml(item.subtitle)}</span>
        </div>
      </div>
      ${timeCol || '<span class="track-added-at track-added-at--empty" aria-hidden="true"></span>'}
      <div class="track-row-end">
        ${
          item.spotifyUrl
            ? `<span class="listening-row-spotify">${spotifyLinkHtml(item.spotifyUrl, 'Open in Spotify')}</span>`
            : ''
        }
      </div>
    </div>
  `
}

function gridCellHtml(item: ListeningItem, index: number, cellPx: number, selected: boolean): string {
  const art = renderImg({
    images: item.images,
    targetWidth: IMAGE_SIZES.albumGrid,
    width: cellPx,
    height: cellPx,
    alt: item.name,
    loading: index < 24 ? 'eager' : 'lazy',
    sizes: `${cellPx}px`,
  })

  const inCart = item.track && isInCart(item.track.id)
  const inCartClass = inCart ? ' album-cell-in-cart' : ''
  const draggable = item.kind === 'track' && item.track ? ' draggable="true"' : ''
  const trackIdAttr =
    item.track?.id ? ` data-track-id="${escapeHtml(item.track.id)}"` : ''

  return `
    <div
      class="album-cell${selected ? ' album-cell-active' : ''}${inCartClass}"
      role="button"
      tabindex="0"
      data-item-index="${index}"
      data-item-id="${escapeHtml(item.id)}"
      aria-label="${escapeHtml(item.name)}"
      ${draggable}${trackIdAttr}
    >
      ${art || `<span class="album-cell-placeholder">${item.kind === 'genre' ? '#' : '♪'}</span>`}
    </div>
  `
}

export function listeningBodyHtml(
  prefs: BrowsePrefs,
  items: ListeningItem[],
  emptyMessage: string,
  genreBarMode = false
): string {
  if (!items.length) {
    return `<p class="stats-empty">${escapeHtml(emptyMessage)}</p>`
  }

  if (genreBarMode || isGenreBarMode(items)) {
    return genreBarListHtml(items)
  }

  const selectedIndex = prefs.selectedId
    ? items.findIndex((i) => i.id === prefs.selectedId)
    : -1
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex]! : null

  if (prefs.viewMode === 'list') {
    const rows = items.map((item, i) => listRowHtml(item, i, item.id === prefs.selectedId))
    return `
      <div class="album-grid-layout listening-split-layout">
        <div class="listening-list-column">
          <div class="track-list">${rows.join('')}</div>
        </div>
        <div class="album-preview-column" data-listening-preview>
          ${detailPanelHtml(selectedItem, 'idle', undefined, true, false)}
        </div>
      </div>
    `
  }

  const cells = items
    .map((item, i) => gridCellHtml(item, i, prefs.gridCellSize, item.id === prefs.selectedId))
    .join('')

  return `
    <div class="album-grid-layout listening-grid-layout">
      <div class="album-grid" role="list" style="--album-grid-min: ${prefs.gridCellSize}px">
        ${cells}
      </div>
      <div class="album-preview-column" data-listening-preview>
        ${detailPanelHtml(selectedItem, 'idle', undefined, Boolean(selectedItem), true)}
      </div>
    </div>
  `
}

export type BrowseBindOpts = {
  root: HTMLElement
  storagePrefix: string
  prefs: BrowsePrefs
  sortOptions: SortOption[]
  allItems: ListeningItem[]
  emptyMessage: string
  genreBarMode?: boolean
  onChange: (prefs: BrowsePrefs) => void
}

export function bindListeningBrowse(opts: BrowseBindOpts): void {
  const {
    root,
    storagePrefix,
    sortOptions,
    allItems,
    emptyMessage,
    genreBarMode: genreBarModeOpt = false,
    onChange,
  } = opts
  let prefs = { ...opts.prefs }

  const genreBarMode = (): boolean =>
    genreBarModeOpt || isGenreBarMode(allItems)

  const getVisible = (): ListeningItem[] =>
    filterListeningItems(sortListeningItems(allItems, prefs.sortMode), prefs.searchQuery)

  const persistSelection = (next: BrowsePrefs): void => {
    prefs = next
    saveBrowsePrefs(storagePrefix, prefs)
    onChange(prefs)
  }

  const rerenderBody = (): void => {
    stopPreview()
    const wrap = root.querySelector('[data-listening-body]')
    if (!wrap) return
    const visible = getVisible()
    if (prefs.selectedId && !visible.some((i) => i.id === prefs.selectedId)) {
      prefs = { ...prefs, selectedId: null }
      saveBrowsePrefs(storagePrefix, prefs)
    }
    wrap.innerHTML = listeningBodyHtml(prefs, visible, emptyMessage, genreBarMode())
    if (!genreBarMode()) {
      bindSelection(root, visible, prefs, persistSelection)
    }
  }

  const updateSearchMeta = (): void => {
    const wrap = root.querySelector('[data-listening-toolbar]')
    if (!wrap) return
    const visible = getVisible()
    const q = prefs.searchQuery.trim()
    const existing = wrap.querySelector('.detail-track-search-meta')
    if (q && visible.length !== allItems.length) {
      const html = `<p class="detail-track-search-meta">${visible.length} of ${allItems.length}</p>`
      if (existing) existing.outerHTML = html
      else wrap.insertAdjacentHTML('beforeend', html)
    } else {
      existing?.remove()
    }
  }

  const applyPrefs = (
    next: BrowsePrefs,
    opts: { toolbar?: boolean; body?: boolean } = {}
  ): void => {
    prefs = next
    saveBrowsePrefs(storagePrefix, prefs)
    onChange(prefs)
    if (opts.toolbar !== false) rerenderToolbar()
    else updateSearchMeta()
    if (opts.body !== false) rerenderBody()
  }

  const rerenderToolbar = (): void => {
    const wrap = root.querySelector('[data-listening-toolbar]')
    if (!wrap) return
    const visible = getVisible()
    wrap.innerHTML = listeningToolbarHtml(
      prefs,
      sortOptions,
      root.dataset.searchPlaceholder ?? 'Search…',
      visible.length,
      allItems.length,
      genreBarMode()
    )
    bindToolbar(root, () => prefs, applyPrefs)
  }

  bindToolbar(root, () => prefs, applyPrefs)

  setCartTrackResolver((trackId) => {
    const item = allItems.find((i) => i.track?.id === trackId)
    return item?.track ?? null
  })

  const rootWithCleanup = root as HTMLElement & { __listeningPreviewCleanup?: () => void }
  const prevCleanup = rootWithCleanup.__listeningPreviewCleanup
  rootWithCleanup.__listeningPreviewCleanup = () => {
    prevCleanup?.()
    setCartTrackResolver(null)
  }

  if (!genreBarMode()) {
    const visible = getVisible()
    bindSelection(root, visible, prefs, persistSelection)
  }

  bindPreviewSettings(root)
}

function bindToolbar(
  root: HTMLElement,
  getPrefs: () => BrowsePrefs,
  onUpdate: (prefs: BrowsePrefs, opts?: { toolbar?: boolean; body?: boolean }) => void
): void {
  root.querySelectorAll<HTMLButtonElement>('[data-view-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prefs = getPrefs()
      const mode = btn.dataset.viewMode as BrowseViewMode
      if (!mode || mode === prefs.viewMode) return
      stopPreview()
      if (mode === 'grid') unlockPreviewAudio()
      onUpdate({ ...prefs, viewMode: mode, selectedId: prefs.selectedId })
    })
  })

  const search = root.querySelector<HTMLInputElement>('[data-listening-search]')
  search?.addEventListener('input', () => {
    onUpdate({ ...getPrefs(), searchQuery: search.value }, { toolbar: false })
  })

  root.querySelector('[data-grid-dec]')?.addEventListener('click', () => {
    const prefs = getPrefs()
    const next = Math.max(GRID_SIZE_MIN, prefs.gridCellSize - GRID_SIZE_STEP)
    if (next === prefs.gridCellSize) return
    saveGridCellSize(next)
    onUpdate({ ...prefs, gridCellSize: next })
  })

  root.querySelector('[data-grid-inc]')?.addEventListener('click', () => {
    const prefs = getPrefs()
    const next = Math.min(GRID_SIZE_MAX, prefs.gridCellSize + GRID_SIZE_STEP)
    if (next === prefs.gridCellSize) return
    saveGridCellSize(next)
    onUpdate({ ...prefs, gridCellSize: next })
  })

  const sortWrap = root.querySelector<HTMLElement>('.listening-sort')
  const trigger = sortWrap?.querySelector<HTMLElement>('[data-sort-trigger]')
  const menu = sortWrap?.querySelector<HTMLElement>('.detail-sort-menu')

  trigger?.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!menu || !sortWrap) return
    const willOpen = sortWrap.dataset.sortOpen !== 'true'
    closeAllSortMenus(root)
    if (willOpen) {
      sortWrap.dataset.sortOpen = 'true'
      menu.hidden = false
      trigger.setAttribute('aria-expanded', 'true')
      setTimeout(() => {
        document.addEventListener(
          'click',
          (ev) => {
            const t = ev.target as HTMLElement
            if (t.closest('.stats-toggle-panel')) return
            closeAllSortMenus(root)
          },
          { once: true }
        )
      }, 0)
    }
  })

  menu?.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const prefs = getPrefs()
      const mode = btn.dataset.sort as ListeningSortMode
      if (!mode || mode === prefs.sortMode) {
        closeAllSortMenus(root)
        return
      }
      closeAllSortMenus(root)
      onUpdate({ ...prefs, sortMode: mode })
    })
  })
}

function closeAllSortMenus(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.listening-sort').forEach((wrap) => {
    wrap.dataset.sortOpen = 'false'
    const menu = wrap.querySelector<HTMLElement>('.detail-sort-menu')
    const trigger = wrap.querySelector<HTMLElement>('[data-sort-trigger]')
    if (menu) menu.hidden = true
    trigger?.setAttribute('aria-expanded', 'false')
  })
}

function bindSelection(
  root: HTMLElement,
  items: ListeningItem[],
  prefs: BrowsePrefs,
  onPersistSelection: (prefs: BrowsePrefs) => void
): void {
  const gridMode = prefs.viewMode === 'grid'
  let hoverToken = 0
  let pinnedId: string | null = prefs.selectedId
  let activeId: string | null = prefs.selectedId
  let hoveredId: string | null = null
  let pendingPreviewId: string | null = null
  let lastPanelStatus: 'idle' | 'loading' | 'playing' | 'unavailable' | 'error' = 'idle'

  const layout = root.querySelector('.album-grid-layout')
  const grid = root.querySelector('.album-grid')

  const findItem = (id: string | null): ListeningItem | null =>
    id ? items.find((i) => i.id === id) ?? null : null

  const syncActiveClasses = (highlightId: string | null): void => {
    root.querySelectorAll<HTMLElement>('.album-cell, .listening-track-row').forEach((el) => {
      const id = el.dataset.itemId
      const active =
        id != null &&
        (gridMode
          ? pinnedId != null
            ? id === pinnedId
            : id === highlightId
          : id === (pinnedId ?? highlightId))
      el.classList.toggle(
        gridMode ? 'album-cell-active' : 'listening-row-selected',
        active
      )
    })
  }

  const syncVisualizer = (
    status: 'idle' | 'loading' | 'playing' | 'unavailable' | 'error'
  ): void => {
    if (status !== 'playing' || !isVisualizerEnabled()) {
      stopPreviewVisualizer()
      return
    }
    const canvas = root.querySelector<HTMLCanvasElement>('.preview-visualizer')
    if (canvas) startPreviewVisualizer(canvas)
  }

  const updatePanel = (
    item: ListeningItem | null,
    status: 'idle' | 'loading' | 'playing' | 'unavailable' | 'error' = 'idle',
    statusMessage?: string
  ): void => {
    lastPanelStatus = status
    if (item) activeId = item.id
    const panel =
      root.querySelector('[data-listening-preview] .listening-detail-panel') ??
      root.querySelector('.listening-detail-panel')
    if (!panel) return
    const pinned = item != null && item.id === pinnedId
    panel.outerHTML = detailPanelHtml(item, status, statusMessage, pinned, gridMode)
    updateCartButtons(root)
    syncVisualizer(status)
    syncActiveClasses(item?.id ?? null)
  }

  const clearSelection = (): void => {
    pinnedId = null
    activeId = null
    hoverToken += 1
    stopPreview()
    onPersistSelection({ ...prefs, selectedId: null })
    updatePanel(null)
  }

  const playTrackPreview = (item: ListeningItem): void => {
    if (item.kind !== 'track' || !item.track) {
      updatePanel(item, 'idle')
      return
    }
    pendingPreviewId = item.id
    unlockPreviewAudio()
    void (async () => {
      const token = ++hoverToken
      const track = item.track!
      try {
        updatePanel(item, 'loading')
        stopPreview()
        const previewUrl = await resolvePreviewUrl(track.id, track.preview_url)
        if (token !== hoverToken) return
        if (!previewUrl) {
          updatePanel(item, 'unavailable')
          return
        }
        updatePanel(item, 'playing')
        const ok = await playPreview(previewUrl, {
          isCancelled: () => token !== hoverToken,
        })
        if (token !== hoverToken) {
          stopPreview()
          return
        }
        if (!ok) {
          updatePanel(item, 'error', getPreviewError() ?? 'Could not play preview')
        } else {
          syncVisualizer('playing')
        }
      } finally {
        if (pendingPreviewId === item.id) pendingPreviewId = null
      }
    })()
  }

  const keepPreviewOnPin = (item: ListeningItem): boolean => {
    const onThisItem =
      hoveredId === item.id ||
      activeId === item.id ||
      pendingPreviewId === item.id
    if (!onThisItem) return false
    return (
      isPreviewPlaying() ||
      pendingPreviewId === item.id ||
      lastPanelStatus === 'playing' ||
      lastPanelStatus === 'loading'
    )
  }

  const selectItem = (item: ListeningItem, pin: boolean): void => {
    if (pin) {
      pinnedId = item.id
      onPersistSelection({ ...prefs, selectedId: item.id })
    }
    if (item.kind === 'track') {
      if (pin && keepPreviewOnPin(item)) {
        const status = isPreviewPlaying()
          ? 'playing'
          : lastPanelStatus === 'idle'
            ? 'loading'
            : lastPanelStatus
        updatePanel(item, status)
        return
      }
      playTrackPreview(item)
    } else {
      hoverToken += 1
      stopPreview()
      if (pin) onPersistSelection({ ...prefs, selectedId: item.id })
      updatePanel(item, 'idle')
    }
  }

  const onVizTuningChanged = (): void => {
    if (!activeId || lastPanelStatus !== 'playing') return
    const item = findItem(activeId)
    if (item) updatePanel(item, 'playing')
  }

  const rootWithPreview = root as HTMLElement & { __listeningPreviewCleanup?: () => void }
  rootWithPreview.__listeningPreviewCleanup?.()
  window.addEventListener('niche-viz-tuning-changed', onVizTuningChanged)
  rootWithPreview.__listeningPreviewCleanup = () => {
    window.removeEventListener('niche-viz-tuning-changed', onVizTuningChanged)
  }

  const onOutsidePreviewClick = (target: HTMLElement): void => {
    if (target.closest('.album-preview-panel:not(.album-preview-panel-empty)')) return
    if (target.closest('.album-cell, .listening-track-row')) return
    if (target.closest('button, a')) return
    clearSelection()
  }

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.closest('.btn-open-spotify')) {
      hoverToken += 1
      stopPreview()
      const item = findItem(pinnedId ?? activeId)
      if (item) updatePanel(item, 'idle')
      return
    }
    if (gridMode) onOutsidePreviewClick(target)
  })

  grid?.addEventListener('click', (e) => {
    onOutsidePreviewClick(e.target as HTMLElement)
  })

  layout?.addEventListener('mouseleave', (e) => {
    if (!gridMode || pinnedId != null) return
    const related = (e as MouseEvent).relatedTarget as Node | null
    if (layout.contains(related)) return
    hoverToken += 1
    stopPreview()
    updatePanel(null)
  })

  const bindRow = (el: HTMLElement): void => {
    const id = el.dataset.itemId
    if (!id) return
    const item = findItem(id)
    if (!item) return

    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.stats-spotify-link, .btn-add-cart')) return
      e.preventDefault()
      e.stopPropagation()
      if (pinnedId === id) {
        clearSelection()
        return
      }
      selectItem(item, true)
    })

    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      selectItem(item, true)
    })

    if (gridMode && item.kind === 'track' && item.track) {
      bindTrackDragSource(el, item.track, 'album-cell-dragging')

      el.addEventListener('mouseenter', () => {
        if (pinnedId != null) return
        hoveredId = id
        selectItem(item, false)
      })

      el.addEventListener('mouseleave', (e) => {
        if (pinnedId != null) return
        if (hoveredId === id) hoveredId = null
        const related = e.relatedTarget
        if (related instanceof Node && el.contains(related)) return
        if (related instanceof Element) {
          if (related.closest('.album-cell')) return
          if (related.closest('.album-preview-panel:not(.album-preview-panel-empty)')) return
        }
        hoverToken += 1
        stopPreview()
        updatePanel(null)
      })
    }
  }

  root.querySelectorAll<HTMLElement>('.listening-track-row, .album-cell').forEach(bindRow)
  updateCartButtons(root)
  syncActiveClasses(prefs.selectedId)
}

export function listeningBrowseSectionHtml(
  prefs: BrowsePrefs,
  sortOptions: SortOption[],
  items: ListeningItem[],
  searchPlaceholder: string,
  emptyMessage: string,
  genreBarMode = false
): string {
  const barMode = genreBarMode || isGenreBarMode(items)
  const visible = filterListeningItems(
    sortListeningItems(items, prefs.sortMode),
    prefs.searchQuery
  )
  return `
    <div
      class="listening-browse ${barMode ? 'listening-browse-genres' : prefs.viewMode === 'grid' ? 'listening-browse-grid' : 'listening-browse-list'}"
      data-search-placeholder="${escapeHtml(searchPlaceholder)}"
    >
      <div data-listening-toolbar>
        ${listeningToolbarHtml(prefs, sortOptions, searchPlaceholder, visible.length, items.length, barMode)}
      </div>
      <div data-listening-body>
        ${listeningBodyHtml(prefs, visible, emptyMessage, barMode)}
      </div>
    </div>
  `
}
