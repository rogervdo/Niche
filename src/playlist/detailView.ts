import { IMAGE_SIZES, renderImg } from '../spotify/images'
import type { AudioFeatures, SpotifyPlaylist, SpotifyTrack } from '../spotify/types'
import { getAudioFeatures, type PlaylistKind } from '../spotify/api'
import { setCachedTracks } from '../spotify/playlistCache'
import { playPreview, stopPreview, unlockPreviewAudio, getPreviewError } from './previewPlayer'
import { resolvePreviewUrl } from '../spotify/preview'
import { runTrackReplaceFlow } from './trackReplace'

type DetailViewMode = 'list' | 'grid'

type SortMode =
  | 'playlist'
  | 'artist'
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
  { mode: 'artist', label: 'Sort by artist' },
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

/** Current detail view context for delegated replace clicks (survives re-renders). */
let detailReplaceCtx: {
  playlist: SpotifyPlaylist
  tracks: SpotifyTrack[]
  kind: PlaylistKind
  market: string
  canEdit: boolean
  onBack: () => void
  onTracksUpdated?: (tracks: SpotifyTrack[]) => void
} | null = null

let replaceClickBound = false

function resetSortState(playlistId: string): void {
  if (currentPlaylistId === playlistId) return
  currentPlaylistId = playlistId
  sortMode = 'playlist'
  audioFeaturesById = null
  audioFeaturesLoading = false
}

function primaryArtist(track: SpotifyTrack): string {
  return track.artists[0]?.name ?? ''
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

function featureValue(
  track: SpotifyTrack,
  features: Map<string, AudioFeatures> | null,
  key: keyof Pick<AudioFeatures, 'tempo' | 'valence' | 'danceability' | 'acousticness'>
): number {
  return features?.get(track.id)?.[key] ?? -1
}

function sortTracks(
  tracks: SpotifyTrack[],
  mode: SortMode,
  features: Map<string, AudioFeatures> | null
): SpotifyTrack[] {
  if (mode === 'playlist') return tracks

  const sorted = [...tracks]
  sorted.sort((a, b) => {
    switch (mode) {
      case 'artist': {
        const cmp = compareText(primaryArtist(a), primaryArtist(b))
        return cmp !== 0 ? cmp : compareText(a.name, b.name)
      }
      case 'album': {
        const cmp = compareText(a.album.name, b.album.name)
        return cmp !== 0 ? cmp : compareText(a.name, b.name)
      }
      case 'popularity':
        return (a.popularity ?? 0) - (b.popularity ?? 0)
      case 'popularity_desc':
        return (b.popularity ?? 0) - (a.popularity ?? 0)
      case 'release_date':
        return releaseDateMs(a) - releaseDateMs(b)
      case 'tempo':
        return featureValue(a, features, 'tempo') - featureValue(b, features, 'tempo')
      case 'valence':
        return featureValue(b, features, 'valence') - featureValue(a, features, 'valence')
      case 'danceability':
        return (
          featureValue(b, features, 'danceability') -
          featureValue(a, features, 'danceability')
        )
      case 'duration':
        return a.duration_ms - b.duration_ms
      case 'acousticness':
        return (
          featureValue(b, features, 'acousticness') -
          featureValue(a, features, 'acousticness')
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

function replaceButtonHtml(track: SpotifyTrack, canEdit: boolean): string {
  if (!canEdit) return ''
  return `
    <button
      type="button"
      class="btn-track-replace"
      data-track-id="${track.id}"
      title="Search & replace with the most popular version"
      aria-label="Search and replace ${escapeHtml(track.name)}"
    >Replace</button>
  `
}

function trackRow(track: SpotifyTrack, index: number, canEdit: boolean): string {
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

  return `
    <div class="track-row">
      <span class="track-index">${index + 1}</span>
      <a class="track-open" href="${track.external_urls.spotify}" target="_blank" rel="noreferrer">
        <div class="track-art">
          ${art || `<span class="track-art-placeholder">♪</span>`}
          ${popularityBadgeHtml(track)}
        </div>
        <div class="track-info">
          <span class="track-name">${escapeHtml(track.name)}</span>
          <span class="track-artists">${escapeHtml(artists)} · ${escapeHtml(track.album.name)}</span>
        </div>
      </a>
      <span class="track-duration">${formatDuration(track.duration_ms)}</span>
      ${replaceButtonHtml(track, canEdit)}
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

  return `
    <button
      type="button"
      class="album-cell"
      data-track-index="${index}"
      aria-label="${escapeHtml(track.name)} by ${escapeHtml(track.artists.map((a) => a.name).join(', '))}"
    >
      ${art || `<span class="album-cell-placeholder">♪</span>`}
      ${popularityBadgeHtml(track)}
    </button>
  `
}

function previewPanel(
  track: SpotifyTrack | null,
  status: 'idle' | 'loading' | 'playing' | 'unavailable' | 'error' = 'idle',
  statusMessage?: string,
  canEdit = false,
  pinned = false
): string {
  if (!track) {
    return `
      <aside class="album-preview-panel album-preview-panel-empty">
        <p>Hover an album to preview</p>
        <span class="preview-hint">Plays the first 20 seconds — like <a href="https://discoverquickly.com" target="_blank" rel="noreferrer">Discover Quickly</a></span>
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
          ${
            pinned
              ? `<button type="button" class="btn-preview-deselect">Deselect</button>`
              : ''
          }
          ${
            canEdit
              ? `<button type="button" class="btn-track-replace" data-track-id="${track.id}">Search & replace</button>`
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

function tracksSection(
  tracks: SpotifyTrack[],
  activeIndex: number | null,
  canEdit: boolean
): string {
  if (!tracks.length) {
    return '<p class="empty">No tracks in this playlist.</p>'
  }

  if (viewMode === 'list') {
    return `
      <div class="track-list">
        ${tracks.map((t, i) => trackRow(t, i, canEdit)).join('')}
      </div>
    `
  }

  const activeTrack = activeIndex != null ? tracks[activeIndex] ?? null : null

  return `
    <div class="album-grid-layout">
      <div
        class="album-grid"
        role="list"
        style="--album-grid-min: ${gridCellSize}px"
      >
        ${tracks.map((t, i) => albumCell(t, i)).join('')}
      </div>
      ${previewPanel(activeTrack, 'idle', undefined, canEdit)}
    </div>
  `
}

function bindGridPreview(
  root: HTMLElement,
  tracks: SpotifyTrack[],
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
        index != null ? tracks[index] ?? null : null,
        status,
        statusMessage,
        canEdit,
        pinned
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
      const track = tracks[index]
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

  root.querySelectorAll<HTMLButtonElement>('.album-cell').forEach((cell) => {
    const index = Number(cell.dataset.trackIndex)
    if (Number.isNaN(index)) return

    cell.addEventListener('mouseenter', () => {
      if (pinnedIndex != null) return
      selectTrack(index, false)
    })

    cell.addEventListener('click', (e) => {
      e.stopPropagation()
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
  tracks: SpotifyTrack[],
  kind: PlaylistKind,
  market: string,
  onBack: () => void,
  onTracksUpdated?: (tracks: SpotifyTrack[]) => void
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
    renderPlaylistDetail(root, playlist, tracks, kind, market, onBack, onTracksUpdated)
  }

  dec.addEventListener('click', () => apply(-GRID_SIZE_STEP))
  inc.addEventListener('click', () => apply(GRID_SIZE_STEP))
}

function bindSortMenu(
  root: HTMLElement,
  playlist: SpotifyPlaylist,
  originalTracks: SpotifyTrack[],
  kind: PlaylistKind,
  market: string,
  onBack: () => void,
  onTracksUpdated?: (tracks: SpotifyTrack[]) => void
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
            originalTracks,
            kind,
            market,
            onBack,
            onTracksUpdated
          )
          try {
            audioFeaturesById = await getAudioFeatures(
              originalTracks.map((t) => t.id)
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
          originalTracks,
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

function bindTrackReplace(root: HTMLElement): void {
  if (replaceClickBound) return
  replaceClickBound = true

  root.addEventListener('click', (e) => {
    const ctx = detailReplaceCtx
    if (!ctx?.canEdit) return

    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.btn-track-replace')
    if (!btn) return
    e.preventDefault()
    e.stopPropagation()

    const trackId = btn.dataset.trackId
    if (!trackId) return

    const position = ctx.tracks.findIndex((t) => t.id === trackId)
    const track = ctx.tracks[position]
    if (!track || position < 0) return

    void runTrackReplaceFlow({
      playlistId: ctx.playlist.id,
      track,
      position,
      market: ctx.market,
      onSuccess: (candidate) => {
        const updated = [...ctx.tracks]
        updated[position] = candidate
        setCachedTracks(ctx.playlist.id, ctx.market, updated)
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
  tracks: SpotifyTrack[],
  kind: PlaylistKind,
  market: string,
  onBack: () => void,
  onTracksUpdated?: (tracks: SpotifyTrack[]) => void
): void {
  stopPreview()
  resetSortState(playlist.id)

  const canEdit = kind !== 'followed'
  detailReplaceCtx = {
    playlist,
    tracks,
    kind,
    market,
    canEdit,
    onBack,
    onTracksUpdated,
  }
  const displayTracks = sortTracks(tracks, sortMode, audioFeaturesById)

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
            ${escapeHtml(owner)} · ${displayTracks.length} track${displayTracks.length === 1 ? '' : 's'}
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
            ${gridSizeControlsHtml()}
            ${sortMenuHtml()}
          </div>
        </div>
        ${tracksSection(displayTracks, null, canEdit)}
      </div>
    </div>
  `

  root.querySelector('#back-btn')!.addEventListener('click', () => {
    stopPreview()
    onBack()
  })

  root.querySelectorAll<HTMLButtonElement>('.view-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as DetailViewMode
      if (mode === viewMode) return
      if (mode === 'grid') unlockPreviewAudio()
      viewMode = mode
      renderPlaylistDetail(root, playlist, tracks, kind, market, onBack, onTracksUpdated)
    })
  })

  bindSortMenu(root, playlist, tracks, kind, market, onBack, onTracksUpdated)
  bindGridSizeControls(root, playlist, tracks, kind, market, onBack, onTracksUpdated)
  bindTrackReplace(root)

  if (viewMode === 'grid' && displayTracks.length) {
    bindGridPreview(root, displayTracks, canEdit)
  }
}
