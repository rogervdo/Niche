import { IMAGE_SIZES, renderImg } from '../spotify/images'
import type { SpotifyPlaylist, SpotifyTrack } from '../spotify/types'
import type { PlaylistKind } from '../spotify/api'
import { playPreview, stopPreview, unlockPreviewAudio, getPreviewError } from './previewPlayer'
import {
  beginGridPreviewWarmup,
  clearGridPreviewWarmup,
  resolvePreviewUrl,
} from '../spotify/preview'

type DetailViewMode = 'list' | 'grid'

let viewMode: DetailViewMode = 'list'

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

function trackRow(track: SpotifyTrack, index: number): string {
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
    <a class="track-row" href="${track.external_urls.spotify}" target="_blank" rel="noreferrer">
      <span class="track-index">${index + 1}</span>
      <div class="track-art">
        ${art || `<span class="track-art-placeholder">♪</span>`}
      </div>
      <div class="track-info">
        <span class="track-name">${escapeHtml(track.name)}</span>
        <span class="track-artists">${escapeHtml(artists)} · ${escapeHtml(track.album.name)}</span>
      </div>
      <span class="track-duration">${formatDuration(track.duration_ms)}</span>
    </a>
  `
}

function albumCell(track: SpotifyTrack, index: number): string {
  const art = renderImg({
    images: track.album.images,
    targetWidth: IMAGE_SIZES.albumGrid,
    width: 160,
    height: 160,
    alt: track.name,
    loading: index < 24 ? 'eager' : 'lazy',
    sizes: '(max-width: 900px) 25vw, 160px',
  })

  return `
    <button
      type="button"
      class="album-cell"
      data-track-index="${index}"
      aria-label="${escapeHtml(track.name)} by ${escapeHtml(track.artists.map((a) => a.name).join(', '))}"
    >
      ${art || `<span class="album-cell-placeholder">♪</span>`}
    </button>
  `
}

function previewPanel(
  track: SpotifyTrack | null,
  status: 'idle' | 'loading' | 'playing' | 'unavailable' | 'error' = 'idle',
  statusMessage?: string
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

  let statusText = 'Hover to preview'
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
        <a
          class="btn-open-spotify"
          href="${track.external_urls.spotify}"
          target="_blank"
          rel="noreferrer"
        >Open in Spotify</a>
      </div>
    </aside>
  `
}

function tracksSection(tracks: SpotifyTrack[], activeIndex: number | null): string {
  if (!tracks.length) {
    return '<p class="empty">No tracks in this playlist.</p>'
  }

  if (viewMode === 'list') {
    return `
      <div class="track-list">
        ${tracks.map((t, i) => trackRow(t, i)).join('')}
      </div>
    `
  }

  const activeTrack = activeIndex != null ? tracks[activeIndex] ?? null : null

  return `
    <div class="album-grid-layout">
      <div class="album-grid" role="list">
        ${tracks.map((t, i) => albumCell(t, i)).join('')}
      </div>
      ${previewPanel(activeTrack)}
    </div>
  `
}

function bindGridPreview(
  root: HTMLElement,
  tracks: SpotifyTrack[]
): void {
  let hoverToken = 0
  beginGridPreviewWarmup(tracks)

  const updatePanel = (
    index: number | null,
    status: 'idle' | 'loading' | 'playing' | 'unavailable' | 'error' = 'idle',
    statusMessage?: string
  ): void => {
    const layout = root.querySelector('.album-grid-layout')
    if (!layout) return
    const panel = layout.querySelector('.album-preview-panel')
    if (panel) {
      panel.outerHTML = previewPanel(
        index != null ? tracks[index] ?? null : null,
        status,
        statusMessage
      )
    }
    root.querySelectorAll('.album-cell').forEach((cell, i) => {
      cell.classList.toggle('album-cell-active', i === index)
    })
  }

  root.querySelectorAll<HTMLButtonElement>('.album-cell').forEach((cell) => {
    cell.addEventListener('mouseenter', () => {
      void (async () => {
        const index = Number(cell.dataset.trackIndex)
        if (Number.isNaN(index)) return
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
    })
  })

  const layout = root.querySelector('.album-grid-layout')
  layout?.addEventListener('click', () => unlockPreviewAudio(), { once: true })
  layout?.addEventListener('mouseleave', (e) => {
    const related = (e as MouseEvent).relatedTarget as Node | null
    if (layout.contains(related)) return
    hoverToken += 1
    stopPreview()
    clearGridPreviewWarmup()
    updatePanel(null)
  })
}

export function renderPlaylistDetail(
  root: HTMLElement,
  playlist: SpotifyPlaylist,
  tracks: SpotifyTrack[],
  kind: PlaylistKind,
  market: string,
  onBack: () => void
): void {
  stopPreview()
  clearGridPreviewWarmup()

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
            ${escapeHtml(owner)} · ${tracks.length} track${tracks.length === 1 ? '' : 's'}
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
        ${tracksSection(tracks, null)}
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
      renderPlaylistDetail(root, playlist, tracks, kind, market, onBack)
    })
  })

  if (viewMode === 'grid' && tracks.length) {
    bindGridPreview(root, tracks)
  }
}
