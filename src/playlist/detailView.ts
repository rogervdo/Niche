import { IMAGE_SIZES, renderImg } from '../spotify/images'
import type {
  AudioFeatures,
  PlaylistTrackEntry,
  SpotifyPlaylist,
  SpotifyTrack,
} from '../spotify/types'
import { getAudioFeatures, type PlaylistKind } from '../spotify/api'
import { setCachedEntries } from '../spotify/playlistCache'
import { isPlaylistDebugEnabled, playlistDebug, playlistDebugWarn } from '../spotify/playlistDebug'
import { playPreview, stopPreview, unlockPreviewAudio, getPreviewError } from './previewPlayer'
import { resolvePreviewUrl } from '../spotify/preview'
import { runTrackReplaceFlow } from './trackReplace'
import { runDuplicateDetectFlow } from './detectDuplicates'
import { duplicateTrackIds } from '../spotify/trackDuplicates'
import { addToCart, isInCart, removeFromCart } from '../cart/cart'
import { NICHE_TRACK_DRAG_TYPE, setCartTrackResolver, updateCartButtons } from '../cart/ui'
import { iconCheck, iconPlus, iconSearch, iconSwap } from '../ui/icons'

type DetailViewMode = 'list' | 'grid'

type SortMode =
  | 'playlist'
  | 'artist'
  | 'artist_count'
  | 'artist_count_desc'
  | 'album'
  | 'popularity'
  | 'popularity_desc'
  | 'release_date'
  | 'tempo'
  | 'valence'
  | 'danceability'
  | 'duration'
  | 'acousticness'

const SORT_OPTIONS: { mode: SortMode; label: string }[] = [
  { mode: 'playlist', label: 'Sort by playlist order' },
  { mode: 'artist', label: 'Sort by artist (A–Z)' },
  { mode: 'artist_count', label: 'Sort by artist (fewest songs)' },
  { mode: 'artist_count_desc', label: 'Sort by artist (most songs)' },
  { mode: 'album', label: 'Sort by album' },
  { mode: 'popularity', label: 'Sort by popularity (least to most)' },
  { mode: 'popularity_desc', label: 'Sort by popularity (most to least)' },
  { mode: 'release_date', label: 'Sort by release date' },
  { mode: 'tempo', label: 'Sort slowest to fastest' },
  { mode: 'valence', label: 'Sort happiest to saddest' },
  { mode: 'danceability', label: 'Sort by most to least danceable' },
  { mode: 'duration', label: 'Sort by song length (short to long)' },
  { mode: 'acousticness', label: 'Sort acoustic to electric' },
]

const AUDIO_SORT_MODES = new Set<SortMode>([
  'tempo',
  'valence',
  'danceability',
  'acousticness',
])

const POPULARITY_SORT_MODES = new Set<SortMode>(['popularity', 'popularity_desc'])

const ARTIST_GROUP_SORT_MODES = new Set<SortMode>([
  'artist',
  'artist_count',
  'artist_count_desc',
])

const GROUPED_SORT_MODES = new Set<SortMode>([
  'album',
  ...ARTIST_GROUP_SORT_MODES,
  'release_date',
])

const GRID_SIZE_MIN = 80
const GRID_SIZE_MAX = 220
const GRID_SIZE_STEP = 16
const GRID_SIZE_STORAGE_KEY = 'niche_grid_cell_size'

function loadGridCellSize(): number {
  const raw = localStorage.getItem(GRID_SIZE_STORAGE_KEY)
  const n = raw ? Number(raw) : NaN
  if (!Number.isFinite(n)) return 120
  return Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, Math.round(n)))
}

let viewMode: DetailViewMode = 'list'
let gridCellSize = loadGridCellSize()
let sortMode: SortMode = 'playlist'
let audioFeaturesById: Map<string, AudioFeatures> | null = null
let audioFeaturesLoading = false
let currentPlaylistId: string | null = null
let highlightedDuplicateIds: Set<string> | null = null

type DisplayRow = { track: SpotifyTrack; playlistPosition: number }

/** Current detail view context for delegated replace clicks (survives re-renders). */
let detailReplaceCtx: {
  playlist: SpotifyPlaylist
  entries: PlaylistTrackEntry[]
  kind: PlaylistKind
  market: string
  canEdit: boolean
  onBack: () => void
  onTracksUpdated?: (entries: PlaylistTrackEntry[]) => void
} | null = null

let replaceClickBound = false
let addToCartClickBound = false
let duplicateClickBound = false

function resetSortState(playlistId: string): void {
  if (currentPlaylistId === playlistId) return
  currentPlaylistId = playlistId
  sortMode = 'playlist'
  audioFeaturesById = null
  audioFeaturesLoading = false
  highlightedDuplicateIds = null
}

function isDuplicateHighlight(trackId: string): boolean {
  return highlightedDuplicateIds?.has(trackId) ?? false
}

function primaryArtist(track: SpotifyTrack): string {
  return track.artists[0]?.name ?? ''
}

function sortGroupLabel(mode: SortMode, track: SpotifyTrack): string | null {
  if (!GROUPED_SORT_MODES.has(mode)) return null
  if (ARTIST_GROUP_SORT_MODES.has(mode)) {
    return primaryArtist(track) || 'Unknown artist'
  }
  switch (mode) {
    case 'album':
      return track.album.name || 'Unknown album'
    case 'release_date': {
      const raw = track.album.release_date
      if (!raw) return 'Unknown year'
      return raw.split('-')[0] || 'Unknown year'
    }
    default:
      return null
  }
}

function groupSeparatorHtml(label: string): string {
  return `<div class="track-group-separator" role="separator">${escapeHtml(label)}</div>`
}

function releaseDateMs(track: SpotifyTrack): number {
  const raw = track.album.release_date
  if (!raw) return 0
  const parts = raw.split('-').map((p) => Number(p))
  const year = parts[0] ?? 0
  const month = (parts[1] ?? 1) - 1
  const day = parts[2] ?? 1
  return Date.UTC(year, month, day)
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function artistTrackCounts(rows: DisplayRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { track } of rows) {
    const artist = primaryArtist(track) || 'Unknown artist'
    counts.set(artist, (counts.get(artist) ?? 0) + 1)
  }
  return counts
}

function compareByArtistCount(
  a: DisplayRow,
  b: DisplayRow,
  counts: Map<string, number>,
  descending: boolean
): number {
  const artistA = primaryArtist(a.track) || 'Unknown artist'
  const artistB = primaryArtist(b.track) || 'Unknown artist'
  const countA = counts.get(artistA) ?? 0
  const countB = counts.get(artistB) ?? 0
  if (countA !== countB) {
    return descending ? countB - countA : countA - countB
  }
  const byArtist = compareText(artistA, artistB)
  if (byArtist !== 0) return byArtist
  return compareText(a.track.name, b.track.name)
}

function featureValue(
  track: SpotifyTrack,
  features: Map<string, AudioFeatures> | null,
  key: keyof Pick<AudioFeatures, 'tempo' | 'valence' | 'danceability' | 'acousticness'>
): number {
  return features?.get(track.id)?.[key] ?? -1
}

function sortPlaylistRows(
  rows: DisplayRow[],
  mode: SortMode,
  features: Map<string, AudioFeatures> | null
): DisplayRow[] {
  if (mode === 'playlist') return rows

  const artistCounts =
    mode === 'artist_count' || mode === 'artist_count_desc'
      ? artistTrackCounts(rows)
      : null

  const sorted = [...rows]
  sorted.sort((a, b) => {
    const ta = a.track
    const tb = b.track
    switch (mode) {
      case 'artist': {
        const cmp = compareText(primaryArtist(ta), primaryArtist(tb))
        return cmp !== 0 ? cmp : compareText(ta.name, tb.name)
      }
      case 'artist_count':
        return compareByArtistCount(a, b, artistCounts!, false)
      case 'artist_count_desc':
        return compareByArtistCount(a, b, artistCounts!, true)
      case 'album': {
        const cmp = compareText(ta.album.name, tb.album.name)
        return cmp !== 0 ? cmp : compareText(ta.name, tb.name)
      }
      case 'popularity':
        return (ta.popularity ?? 0) - (tb.popularity ?? 0)
      case 'popularity_desc':
        return (tb.popularity ?? 0) - (ta.popularity ?? 0)
      case 'release_date':
        return releaseDateMs(ta) - releaseDateMs(tb)
      case 'tempo':
        return featureValue(ta, features, 'tempo') - featureValue(tb, features, 'tempo')
      case 'valence':
        return featureValue(tb, features, 'valence') - featureValue(ta, features, 'valence')
      case 'danceability':
        return (
          featureValue(tb, features, 'danceability') -
          featureValue(ta, features, 'danceability')
        )
      case 'duration':
        return ta.duration_ms - tb.duration_ms
      case 'acousticness':
        return (
          featureValue(tb, features, 'acousticness') -
          featureValue(ta, features, 'acousticness')
        )
      default:
        return 0
    }
  })
  return sorted
}

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

function formatDuration(ms: number): string {
  const min = Math.floor(ms / 60_000)
  const sec = Math.floor((ms % 60_000) / 1000)
  return `${min}:${sec.toString().padStart(2, '0')}`
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

function showPopularityBadge(): boolean {
  return POPULARITY_SORT_MODES.has(sortMode)
}

function popularityBadgeHtml(track: SpotifyTrack): string {
  if (!showPopularityBadge()) return ''
  const pop = track.popularity
  if (pop == null) return ''
  return `<span class="track-popularity-badge" aria-label="Popularity ${pop}">${pop}</span>`
}

function addToCartButtonHtml(track: SpotifyTrack): string {
  const inCart = isInCart(track.id)
  return `
    <button
      type="button"
      class="btn-track-action btn-add-cart${inCart ? ' in-cart' : ''}"
      draggable="false"
      data-track-id="${track.id}"
      title="${inCart ? 'Remove from cart' : 'Add to cart'}"
      aria-label="${inCart ? 'Remove' : 'Add'} ${escapeHtml(track.name)} ${inCart ? 'from' : 'to'} cart"
      aria-pressed="${inCart}"
    >${inCart ? iconCheck(16) : iconPlus(16)}</button>
  `
}

function replaceButtonHtml(
  track: SpotifyTrack,
  playlistPosition: number,
  canEdit: boolean
): string {
  const title = canEdit
    ? 'Search & replace with the most popular version'
    : 'Search for a more popular version and open in Spotify'
  return `
    <button
      type="button"
      class="btn-track-action btn-track-replace"
      draggable="false"
      data-track-id="${track.id}"
      data-playlist-position="${playlistPosition}"
      title="${title}"
      aria-label="${canEdit ? 'Search and replace' : 'Find popular version of'} ${escapeHtml(track.name)}"
    >${canEdit ? iconSwap(16) : iconSearch(16)}</button>
  `
}

function trackRow(row: DisplayRow, index: number, canEdit: boolean): string {
  const track = row.track
  const artists = track.artists.map((a) => a.name).join(', ')
  const art = renderImg({
    images: track.album.images,
    targetWidth: IMAGE_SIZES.track,
    width: 40,
    height: 40,
    alt: track.name,
    loading: index < 8 ? 'eager' : 'lazy',
    sizes: '40px',
  })

  const dupClass = isDuplicateHighlight(track.id) ? ' track-row-duplicate' : ''
  const inCart = isInCart(track.id)
  const inCartClass = inCart ? ' track-row-in-cart' : ''

  return `
    <div
      class="track-row${dupClass}${inCartClass}"
      data-track-id="${track.id}"
      draggable="true"
    >
      <span class="track-index">${index + 1}</span>
      <a class="track-open" href="${track.external_urls.spotify}" target="_blank" rel="noreferrer" draggable="false">
        <div class="track-art">
          ${art || `<span class="track-art-placeholder">♪</span>`}
          ${popularityBadgeHtml(track)}
        </div>
        <div class="track-info">
          <span class="track-name">${escapeHtml(track.name)}</span>
          <span class="track-artists">${escapeHtml(artists)} · ${escapeHtml(track.album.name)}</span>
        </div>
      </a>
      <div class="track-row-end">
        <div class="track-row-actions">
          ${addToCartButtonHtml(track)}
          ${replaceButtonHtml(track, row.playlistPosition, canEdit)}
        </div>
        <span class="track-duration">${formatDuration(track.duration_ms)}</span>
      </div>
    </div>
  `
}

function albumCell(track: SpotifyTrack, index: number): string {
  const cellPx = gridCellSize
  const art = renderImg({
    images: track.album.images,
    targetWidth: IMAGE_SIZES.albumGrid,
    width: cellPx,
    height: cellPx,
    alt: track.name,
    loading: index < 24 ? 'eager' : 'lazy',
    sizes: `${cellPx}px`,
  })

  const dupClass = isDuplicateHighlight(track.id) ? ' album-cell-duplicate' : ''

  const inCart = isInCart(track.id)
  const inCartClass = inCart ? ' album-cell-in-cart' : ''

  return `
    <div
      class="album-cell${dupClass}${inCartClass}"
      role="button"
      tabindex="0"
      data-track-index="${index}"
      data-track-id="${track.id}"
      draggable="true"
      aria-label="${escapeHtml(track.name)} by ${escapeHtml(track.artists.map((a) => a.name).join(', '))}"
    >
      ${art || `<span class="album-cell-placeholder">♪</span>`}
      ${popularityBadgeHtml(track)}
    </div>
  `
}

function previewPanel(
  track: SpotifyTrack | null,
  status: 'idle' | 'loading' | 'playing' | 'unavailable' | 'error' = 'idle',
  statusMessage?: string,
  canEdit = false,
  pinned = false,
  playlistPosition?: number
): string {
  if (!track) {
    return `
      <aside class="album-preview-panel album-preview-panel-empty">
        <p>Hover an album to preview</p>
      </aside>
    `
  }

  const artists = track.artists.map((a) => a.name).join(', ')
  const art = renderImg({
    images: track.album.images,
    targetWidth: IMAGE_SIZES.detailCover,
    width: 280,
    height: 280,
    alt: track.name,
    loading: 'eager',
    fetchPriority: 'high',
    sizes: '280px',
  })

  let statusText = pinned ? 'Selected' : 'Hover to preview'
  let statusClass = 'preview-status-muted'
  if (status === 'loading') {
    statusText = 'Loading preview…'
    statusClass = 'preview-status-loading'
  } else if (status === 'playing') {
    statusText = 'Playing preview…'
    statusClass = 'preview-status-playing'
  } else if (status === 'unavailable') {
    statusText = 'No preview available for this track'
    statusClass = 'preview-status-muted'
  } else if (status === 'error') {
    statusText = statusMessage ?? 'Could not play preview'
    statusClass = 'preview-status-error'
  }

  return `
    <aside class="album-preview-panel">
      <div class="preview-art">
        ${art || `<span class="card-placeholder">♪</span>`}
      </div>
      <div class="preview-meta">
        <h2 class="preview-track-name">${escapeHtml(track.name)}</h2>
        <p class="preview-artists">${escapeHtml(artists)}</p>
        <p class="preview-album">${escapeHtml(track.album.name)} · ${formatDuration(track.duration_ms)}</p>
        <p class="preview-status ${statusClass}">${escapeHtml(statusText)}</p>
        ${
          track.popularity != null
            ? `<p class="preview-popularity">Popularity ${track.popularity}</p>`
            : ''
        }
        <div class="preview-actions">
          ${addToCartButtonHtml(track)}
          ${
            pinned
              ? `<button type="button" class="btn-preview-deselect">Deselect</button>`
              : ''
          }
          ${
            playlistPosition != null
              ? replaceButtonHtml(track, playlistPosition, canEdit)
              : ''
          }
          <a
            class="btn-open-spotify"
            href="${track.external_urls.spotify}"
            target="_blank"
            rel="noreferrer"
          >Open in Spotify</a>
        </div>
      </div>
    </aside>
  `
}

function duplicatesBannerHtml(): string {
  if (!highlightedDuplicateIds?.size) return ''
  const count = highlightedDuplicateIds.size
  return `
    <div class="dup-highlight-banner" role="status">
      Highlighting ${count} duplicate track${count === 1 ? '' : 's'}.
      <button type="button" class="dup-clear-btn" id="clear-duplicates-btn">Clear</button>
    </div>
  `
}

function gridSizeControlsHtml(): string {
  if (viewMode !== 'grid') return ''

  const atMin = gridCellSize <= GRID_SIZE_MIN
  const atMax = gridCellSize >= GRID_SIZE_MAX

  return `
    <div class="grid-size-control" aria-label="Grid size">
      <button
        type="button"
        class="grid-size-btn"
        id="grid-size-dec"
        aria-label="Decrease grid size"
        ${atMin ? 'disabled' : ''}
      >−</button>
      <span class="grid-size-label" aria-hidden="true">${gridCellSize}px</span>
      <button
        type="button"
        class="grid-size-btn"
        id="grid-size-inc"
        aria-label="Increase grid size"
        ${atMax ? 'disabled' : ''}
      >+</button>
    </div>
  `
}

function sortMenuHtml(): string {
  const activeLabel = audioFeaturesLoading
    ? 'Loading audio data…'
    : (SORT_OPTIONS.find((o) => o.mode === sortMode)?.label ?? 'Sort by playlist order')

  return `
    <div class="detail-sort" data-sort-open="false">
      <button
        type="button"
        class="detail-sort-trigger"
        id="sort-trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
        ${audioFeaturesLoading ? 'disabled' : ''}
      >
        <span class="detail-sort-label">${escapeHtml(activeLabel)}</span>
        <span class="detail-sort-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="detail-sort-menu" role="listbox" aria-label="Sort tracks" hidden>
        ${SORT_OPTIONS.map(
          (opt) => `
          <button
            type="button"
            class="detail-sort-option ${opt.mode === sortMode ? 'is-active' : ''}"
            role="option"
            aria-selected="${opt.mode === sortMode}"
            data-sort="${opt.mode}"
          >
            <span class="detail-sort-check" aria-hidden="true">${opt.mode === sortMode ? '✓' : ''}</span>
            <span>${escapeHtml(opt.label)}</span>
          </button>
        `
        ).join('')}
      </div>
    </div>
  `
}

function listTracksHtml(rows: DisplayRow[], canEdit: boolean): string {
  let lastGroup: string | null = null
  const parts: string[] = []
  rows.forEach((row, i) => {
    const group = sortGroupLabel(sortMode, row.track)
    if (group !== null && group !== lastGroup) {
      parts.push(groupSeparatorHtml(group))
      lastGroup = group
    }
    parts.push(trackRow(row, i, canEdit))
  })
  return `<div class="track-list">${parts.join('')}</div>`
}

let groupedGridSepObserver: ResizeObserver | null = null

function syncGroupedGridSeparators(grid: HTMLElement): void {
  const entries = [...grid.querySelectorAll<HTMLElement>('.album-grid-entry')]
  entries.forEach((entry, i) => {
    const prev = entries[i - 1]
    const sameRow =
      prev != null && Math.abs(prev.offsetTop - entry.offsetTop) < 2
    entry.classList.toggle('has-sep-before', sameRow)
  })
}

function bindGroupedGridSeparators(root: HTMLElement): void {
  const grid = root.querySelector<HTMLElement>('.album-grid-grouped')
  if (!grid) return

  const sync = () => syncGroupedGridSeparators(grid)
  sync()
  requestAnimationFrame(sync)

  groupedGridSepObserver?.disconnect()
  groupedGridSepObserver = new ResizeObserver(() => sync())
  groupedGridSepObserver.observe(grid)
}

function groupedGridHtml(rows: DisplayRow[]): string {
  const entries: string[] = []
  let currentLabel: string | null = null
  let cells: string[] = []

  const flush = () => {
    if (currentLabel === null) return
    entries.push(`
      <div class="album-grid-entry">
        <span class="album-grid-label">${escapeHtml(currentLabel)}</span>
        <div class="album-grid-entry-cells">${cells.join('')}</div>
      </div>
    `)
    cells = []
  }

  rows.forEach((row, i) => {
    const label = sortGroupLabel(sortMode, row.track)
    if (label !== currentLabel) {
      flush()
      currentLabel = label
    }
    cells.push(albumCell(row.track, i))
  })
  flush()

  return entries.join('')
}

function tracksSection(
  rows: DisplayRow[],
  activeIndex: number | null,
  canEdit: boolean
): string {
  if (!rows.length) {
    return '<p class="empty">No tracks in this playlist.</p>'
  }

  if (viewMode === 'list') {
    return listTracksHtml(rows, canEdit)
  }

  const activeRow = activeIndex != null ? rows[activeIndex] ?? null : null
  const grouped = GROUPED_SORT_MODES.has(sortMode)
  const gridBody = grouped
    ? groupedGridHtml(rows)
    : rows.map((row, i) => albumCell(row.track, i)).join('')

  return `
    <div class="album-grid-layout">
      <div
        class="album-grid${grouped ? ' album-grid-grouped' : ''}"
        role="list"
        style="--album-grid-min: ${gridCellSize}px"
      >
        ${gridBody}
      </div>
      ${previewPanel(activeRow?.track ?? null, 'idle', undefined, canEdit, false, activeRow?.playlistPosition)}
    </div>
  `
}

function bindTrackDrag(
  el: HTMLElement,
  track: SpotifyTrack,
  draggingClass: string
): void {
  el.addEventListener('dragstart', (e) => {
    const dt = e.dataTransfer
    if (!dt) return
    dt.setData(NICHE_TRACK_DRAG_TYPE, track.id)
    dt.effectAllowed = 'copy'
    el.classList.add(draggingClass)
  })

  el.addEventListener('dragend', () => {
    el.classList.remove(draggingClass)
  })
}

function bindListTrackDrag(root: HTMLElement, rows: DisplayRow[]): void {
  root.querySelectorAll<HTMLElement>('.track-row[data-track-id]').forEach((row) => {
    const trackId = row.dataset.trackId
    if (!trackId) return
    const track = rows.find((r) => r.track.id === trackId)?.track
    if (!track) return
    bindTrackDrag(row, track, 'track-row-dragging')
  })
}

function bindGridPreview(
  root: HTMLElement,
  rows: DisplayRow[],
  canEdit: boolean
): void {
  let hoverToken = 0
  /** Clicked track stays in the panel until cleared or another track is selected. */
  let pinnedIndex: number | null = null

  const updatePanel = (
    index: number | null,
    status: 'idle' | 'loading' | 'playing' | 'unavailable' | 'error' = 'idle',
    statusMessage?: string
  ): void => {
    const layout = root.querySelector('.album-grid-layout')
    if (!layout) return
    const panel = layout.querySelector('.album-preview-panel')
    const pinned = index != null && index === pinnedIndex
    if (panel) {
      panel.outerHTML = previewPanel(
        index != null ? rows[index]?.track ?? null : null,
        status,
        statusMessage,
        canEdit,
        pinned,
        index != null ? rows[index]?.playlistPosition : undefined
      )
    }
    root.querySelectorAll('.album-cell').forEach((cell, i) => {
      cell.classList.toggle('album-cell-active', pinnedIndex != null ? i === pinnedIndex : i === index)
    })
  }

  const clearSelection = (): void => {
    pinnedIndex = null
    hoverToken += 1
    stopPreview()
    updatePanel(null)
  }

  const selectTrack = (index: number, pin: boolean): void => {
    unlockPreviewAudio()
    if (pin) pinnedIndex = index
    void (async () => {
      const token = ++hoverToken
      const track = rows[index]?.track
      if (!track) return

      updatePanel(index, 'loading')
      stopPreview()

      const previewUrl = await resolvePreviewUrl(track.id, track.preview_url)

      if (token !== hoverToken) return

      if (!previewUrl) {
        updatePanel(index, 'unavailable')
        return
      }

      updatePanel(index, 'playing')
      const ok = await playPreview(previewUrl)
      if (token !== hoverToken) return

      if (!ok) {
        updatePanel(index, 'error', getPreviewError() ?? 'Could not play preview')
      }
    })()
  }

  root.querySelectorAll<HTMLElement>('.album-cell').forEach((cell) => {
    const index = Number(cell.dataset.trackIndex)
    if (Number.isNaN(index)) return
    const track = rows[index]?.track
    if (!track) return

    let suppressClick = false

    bindTrackDrag(cell, track, 'album-cell-dragging')
    cell.addEventListener('dragend', () => {
      suppressClick = true
      window.setTimeout(() => {
        suppressClick = false
      }, 100)
    })

    cell.addEventListener('mouseenter', () => {
      if (pinnedIndex != null) return
      selectTrack(index, false)
    })

    cell.addEventListener('click', (e) => {
      if (suppressClick) return
      e.stopPropagation()
      selectTrack(index, true)
    })

    cell.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      selectTrack(index, true)
    })
  })

  const layout = root.querySelector('.album-grid-layout')
  layout?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.closest('.btn-preview-deselect')) {
      clearSelection()
      return
    }
    if (target.closest('button, a')) return
    clearSelection()
  })
  layout?.addEventListener('mouseleave', (e) => {
    if (pinnedIndex != null) return
    const related = (e as MouseEvent).relatedTarget as Node | null
    if (layout!.contains(related)) return
    hoverToken += 1
    stopPreview()
    updatePanel(null)
  })
}

function setSortMenuOpen(root: HTMLElement, open: boolean): void {
  const wrap = root.querySelector<HTMLElement>('.detail-sort')
  const trigger = root.querySelector<HTMLButtonElement>('#sort-trigger')
  const menu = root.querySelector<HTMLElement>('.detail-sort-menu')
  if (!wrap || !trigger || !menu) return
  wrap.dataset.sortOpen = open ? 'true' : 'false'
  trigger.setAttribute('aria-expanded', String(open))
  menu.hidden = !open
}

function bindGridSizeControls(
  root: HTMLElement,
  playlist: SpotifyPlaylist,
  entries: PlaylistTrackEntry[],
  kind: PlaylistKind,
  market: string,
  onBack: () => void,
  onTracksUpdated?: (entries: PlaylistTrackEntry[]) => void
): void {
  const dec = root.querySelector<HTMLButtonElement>('#grid-size-dec')
  const inc = root.querySelector<HTMLButtonElement>('#grid-size-inc')
  if (!dec || !inc) return

  const apply = (delta: number) => {
    const next = Math.min(
      GRID_SIZE_MAX,
      Math.max(GRID_SIZE_MIN, gridCellSize + delta)
    )
    if (next === gridCellSize) return
    gridCellSize = next
    localStorage.setItem(GRID_SIZE_STORAGE_KEY, String(gridCellSize))
    renderPlaylistDetail(root, playlist, entries, kind, market, onBack, onTracksUpdated)
  }

  dec.addEventListener('click', () => apply(-GRID_SIZE_STEP))
  inc.addEventListener('click', () => apply(GRID_SIZE_STEP))
}

function bindSortMenu(
  root: HTMLElement,
  playlist: SpotifyPlaylist,
  entries: PlaylistTrackEntry[],
  kind: PlaylistKind,
  market: string,
  onBack: () => void,
  onTracksUpdated?: (entries: PlaylistTrackEntry[]) => void
): void {
  const trigger = root.querySelector<HTMLButtonElement>('#sort-trigger')
  const menu = root.querySelector<HTMLElement>('.detail-sort-menu')
  if (!trigger || !menu) return

  const close = () => setSortMenuOpen(root, false)

  trigger.addEventListener('click', (e) => {
    e.stopPropagation()
    const open = root.querySelector<HTMLElement>('.detail-sort')?.dataset.sortOpen !== 'true'
    setSortMenuOpen(root, open)
    if (open) {
      setTimeout(() => {
        document.addEventListener(
          'click',
          () => setSortMenuOpen(root, false),
          { once: true }
        )
      }, 0)
    }
  })

  menu.querySelectorAll<HTMLButtonElement>('.detail-sort-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.sort as SortMode | undefined
      if (!mode || mode === sortMode) {
        close()
        return
      }

      void (async () => {
        if (AUDIO_SORT_MODES.has(mode) && !audioFeaturesById) {
          audioFeaturesLoading = true
          renderPlaylistDetail(
            root,
            playlist,
            entries,
            kind,
            market,
            onBack,
            onTracksUpdated
          )
          try {
            audioFeaturesById = await getAudioFeatures(
              entries.map((e) => e.track.id)
            )
          } finally {
            audioFeaturesLoading = false
          }
        }
        sortMode = mode
        close()
        renderPlaylistDetail(
          root,
          playlist,
          entries,
          kind,
          market,
          onBack,
          onTracksUpdated
        )
      })()
    })
  })

  root.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') close()
    },
    { once: true }
  )
}

function showDetailNotice(root: HTMLElement, message: string, isError = false): void {
  let notice = root.querySelector<HTMLElement>('.detail-notice')
  if (!notice) {
    notice = document.createElement('div')
    notice.className = 'detail-notice'
    const wrap = root.querySelector('.detail-tracks-wrap')
    wrap?.prepend(notice)
  }
  notice.textContent = message
  notice.dataset.error = isError ? 'true' : 'false'
  notice.hidden = false
  window.setTimeout(() => {
    if (notice?.textContent === message) notice.hidden = true
  }, 6000)
}

function bindDetectDuplicates(root: HTMLElement): void {
  if (duplicateClickBound) return
  duplicateClickBound = true

  root.addEventListener('click', (e) => {
    const ctx = detailReplaceCtx
    if (!ctx) return

    const clearBtn = (e.target as HTMLElement).closest('#clear-duplicates-btn')
    if (clearBtn) {
      e.preventDefault()
      highlightedDuplicateIds = null
      renderPlaylistDetail(
        root,
        ctx.playlist,
        ctx.entries,
        ctx.kind,
        ctx.market,
        ctx.onBack,
        ctx.onTracksUpdated
      )
      return
    }

    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      '#detect-duplicates-btn'
    )
    if (!btn) return
    e.preventDefault()

    runDuplicateDetectFlow({
      playlistId: ctx.playlist.id,
      market: ctx.market,
      canEdit: ctx.canEdit,
      onFound: (groups, ids) => {
        highlightedDuplicateIds = ids
        renderPlaylistDetail(
          root,
          ctx.playlist,
          ctx.entries,
          ctx.kind,
          ctx.market,
          ctx.onBack,
          ctx.onTracksUpdated
        )
        showDetailNotice(
          root,
          `Found ${groups.length} duplicate song${groups.length === 1 ? '' : 's'} (${ids.size} tracks).`
        )
      },
      onNone: () => {
        highlightedDuplicateIds = null
        renderPlaylistDetail(
          root,
          ctx.playlist,
          ctx.entries,
          ctx.kind,
          ctx.market,
          ctx.onBack,
          ctx.onTracksUpdated
        )
      },
      onRemoveUpdate: (updatedEntries, groups) => {
        setCachedEntries(ctx.playlist.id, ctx.market, updatedEntries)
        ctx.onTracksUpdated?.(updatedEntries)
        highlightedDuplicateIds = groups.length ? duplicateTrackIds(groups) : null
        renderPlaylistDetail(
          root,
          ctx.playlist,
          updatedEntries,
          ctx.kind,
          ctx.market,
          ctx.onBack,
          ctx.onTracksUpdated
        )
        showDetailNotice(root, `Removed track from “${ctx.playlist.name}”.`)
      },
      onError: (msg) => showDetailNotice(root, msg, true),
    })
  })
}

function bindAddToCart(root: HTMLElement): void {
  if (addToCartClickBound) return
  addToCartClickBound = true

  root.addEventListener('click', (e) => {
    const ctx = detailReplaceCtx
    if (!ctx) return

    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      '.btn-add-cart[data-track-id]'
    )
    if (!btn) return
    e.preventDefault()
    e.stopPropagation()

    const trackId = btn.dataset.trackId
    if (!trackId) return

    const entry = ctx.entries.find((en) => en.track.id === trackId)
    if (!entry) return

    if (isInCart(trackId)) {
      removeFromCart(trackId)
      showDetailNotice(root, `Removed “${entry.track.name}” from cart.`)
    } else {
      addToCart(entry.track)
      showDetailNotice(root, `Added “${entry.track.name}” to cart.`)
    }
    updateCartButtons(root)
  })
}

function bindTrackReplace(root: HTMLElement): void {
  if (replaceClickBound) return
  replaceClickBound = true

  root.addEventListener('click', (e) => {
    const ctx = detailReplaceCtx
    if (!ctx) return

    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      '.btn-track-replace[data-playlist-position][data-track-id]'
    )
    if (!btn) return
    e.preventDefault()
    e.stopPropagation()

    const trackId = btn.dataset.trackId
    const playlistPosition = Number(btn.dataset.playlistPosition)
    if (!trackId || Number.isNaN(playlistPosition)) {
      if (isPlaylistDebugEnabled()) {
        playlistDebugWarn('Replace clicked: missing trackId or playlistPosition', {
          trackId,
          playlistPosition: btn.dataset.playlistPosition,
          dataset: { ...btn.dataset },
        })
      }
      return
    }

    const entryIndex = ctx.entries.findIndex((e) => e.position === playlistPosition)
    const entry = ctx.entries[entryIndex]
    if (!entry || entry.track.id !== trackId) {
      playlistDebugWarn('Replace clicked: entry lookup failed', {
        playlistPosition,
        displayNumber: playlistPosition + 1,
        trackId,
        entryIndex,
        foundId: entry?.track.id ?? null,
        foundName: entry?.track.name ?? null,
        cachedEntryCount: ctx.entries.length,
      })
      return
    }

    playlistDebug('Replace clicked', {
      playlistId: ctx.playlist.id,
      playlistPosition,
      displayNumber: playlistPosition + 1,
      name: entry.track.name,
      trackId,
    })

    void runTrackReplaceFlow({
      playlistId: ctx.playlist.id,
      track: entry.track,
      playlistPosition,
      market: ctx.market,
      allowPlaylistReplace: ctx.canEdit,
      onSuccess: (candidate) => {
        const updated = [...ctx.entries]
        updated[entryIndex] = { ...entry, track: candidate }
        setCachedEntries(ctx.playlist.id, ctx.market, updated)
        ctx.onTracksUpdated?.(updated)
        showDetailNotice(root, `Replaced with “${candidate.name}” (pop ${candidate.popularity ?? '—'})`)
        renderPlaylistDetail(
          root,
          ctx.playlist,
          updated,
          ctx.kind,
          ctx.market,
          ctx.onBack,
          ctx.onTracksUpdated
        )
      },
      onError: (msg) => showDetailNotice(root, msg, true),
    })
  })
}

export function renderPlaylistDetail(
  root: HTMLElement,
  playlist: SpotifyPlaylist,
  entries: PlaylistTrackEntry[],
  kind: PlaylistKind,
  market: string,
  onBack: () => void,
  onTracksUpdated?: (entries: PlaylistTrackEntry[]) => void
): void {
  stopPreview()
  resetSortState(playlist.id)

  const canEdit = kind !== 'followed'
  detailReplaceCtx = {
    playlist,
    entries,
    kind,
    market,
    canEdit,
    onBack,
    onTracksUpdated,
  }
  const displayRows = sortPlaylistRows(
    entries.map((e) => ({ track: e.track, playlistPosition: e.position })),
    sortMode,
    audioFeaturesById
  )

  const cover = renderImg({
    images: playlist.images,
    targetWidth: IMAGE_SIZES.detailCover,
    width: 180,
    height: 180,
    alt: playlist.name,
    loading: 'eager',
    fetchPriority: 'high',
    sizes: '(max-width: 600px) 140px, 180px',
  })
  const owner = playlist.owner?.display_name ?? playlist.owner?.id ?? 'Unknown'

  root.innerHTML = `
    <div class="shell detail-shell ${viewMode === 'grid' ? 'detail-shell-grid' : ''}">
      <button type="button" class="btn-back" id="back-btn">← Back to playlists</button>

      <header class="detail-header">
        <div class="detail-cover">
          ${cover || `<span class="card-placeholder">♪</span>`}
        </div>
        <div class="detail-meta">
          <span class="badge badge-${kind}">${formatKind(kind)}</span>
          <h1>${escapeHtml(playlist.name)}</h1>
          <p class="detail-sub">
            ${escapeHtml(owner)} · ${displayRows.length} track${displayRows.length === 1 ? '' : 's'}
          </p>
          ${
            playlist.description
              ? `<p class="detail-desc">${escapeHtml(playlist.description)}</p>`
              : ''
          }
          <a
            class="btn-open-spotify"
            href="${playlist.external_urls.spotify}"
            target="_blank"
            rel="noreferrer"
          >Open in Spotify</a>
        </div>
      </header>

      <div class="detail-tracks-wrap">
        <div class="detail-tracks-toolbar">
          <div class="detail-view-toggle" role="tablist" aria-label="Track view mode">
            <button
              type="button"
              class="view-mode-btn ${viewMode === 'list' ? 'active' : ''}"
              data-mode="list"
              role="tab"
              aria-selected="${viewMode === 'list'}"
            >List</button>
            <button
              type="button"
              class="view-mode-btn ${viewMode === 'grid' ? 'active' : ''}"
              data-mode="grid"
              role="tab"
              aria-selected="${viewMode === 'grid'}"
            >Grid</button>
          </div>
          <div class="detail-toolbar-actions">
            <button
              type="button"
              class="btn-detect-duplicates"
              id="detect-duplicates-btn"
              title="Find remixes, deluxe, live, and remastered versions of the same song"
            >Detect duplicates</button>
            ${gridSizeControlsHtml()}
            ${sortMenuHtml()}
          </div>
        </div>
        ${duplicatesBannerHtml()}
        ${tracksSection(displayRows, null, canEdit)}
      </div>
    </div>
  `

  setCartTrackResolver((id) => entries.find((en) => en.track.id === id)?.track ?? null)

  root.querySelector('#back-btn')!.addEventListener('click', () => {
    stopPreview()
    setCartTrackResolver(null)
    onBack()
  })

  root.querySelectorAll<HTMLButtonElement>('.view-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as DetailViewMode
      if (mode === viewMode) return
      if (mode === 'grid') unlockPreviewAudio()
      viewMode = mode
      renderPlaylistDetail(root, playlist, entries, kind, market, onBack, onTracksUpdated)
    })
  })

  bindSortMenu(root, playlist, entries, kind, market, onBack, onTracksUpdated)
  bindGridSizeControls(root, playlist, entries, kind, market, onBack, onTracksUpdated)
  bindDetectDuplicates(root)
  bindTrackReplace(root)
  bindAddToCart(root)
  updateCartButtons(root)

  if (viewMode === 'grid' && displayRows.length) {
    if (GROUPED_SORT_MODES.has(sortMode)) {
      bindGroupedGridSeparators(root)
    } else {
      groupedGridSepObserver?.disconnect()
      groupedGridSepObserver = null
    }
    bindGridPreview(root, displayRows, canEdit)
  } else {
    groupedGridSepObserver?.disconnect()
    groupedGridSepObserver = null
    if (viewMode === 'list' && displayRows.length) {
      bindListTrackDrag(root, displayRows)
    }
  }
}
