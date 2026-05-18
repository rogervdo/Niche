import './style.css'
import {
  clearAuth,
  getStoredTokens,
  handleAuthCallback,
  isConfigured,
  loginWithSpotify,
} from './spotify/auth'
import {
  classifyPlaylist,
  getAllPlaylists,
  getCurrentUser,
  getPlaylistTracks,
  type PlaylistKind,
} from './spotify/api'
import { IMAGE_SIZES, renderImg } from './spotify/images'
import type { SpotifyImage } from './spotify/images'
import type { SpotifyPlaylist, SpotifyTrack } from './spotify/types'

const app = document.querySelector<HTMLDivElement>('#app')!

type Filter = 'all' | PlaylistKind

let playlists: SpotifyPlaylist[] = []
let userId = ''
let activeFilter: Filter = 'all'
let searchQuery = ''
let displayName = ''
let userImages: SpotifyImage[] | null = null

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

function renderLogin(missingConfig: boolean): void {
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
      <p class="footnote">
        Uses Spotify Authorization Code with PKCE (browser-only, no backend).
        Inspired by <a href="https://github.com/ethanzohar/discoverify" target="_blank" rel="noreferrer">discoverify</a>.
      </p>
    </div>
  `

  if (!missingConfig) {
    document.getElementById('login-btn')!.addEventListener('click', () => {
      loginWithSpotify().catch(showError)
    })
  }
}

function statsHtml(items: SpotifyPlaylist[]): string {
  const counts = { yours: 0, collaborative: 0, followed: 0 }
  for (const p of items) {
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

function filteredPlaylists(): SpotifyPlaylist[] {
  return playlists.filter((p) => {
    const kind = classifyPlaylist(p, userId)
    if (activeFilter !== 'all' && kind !== activeFilter) return false
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.owner?.display_name ?? p.owner?.id ?? '').toLowerCase().includes(q)
    )
  })
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

function renderPlaylistDetail(playlist: SpotifyPlaylist, tracks: SpotifyTrack[]): void {
  const kind = classifyPlaylist(playlist, userId)
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

  app.innerHTML = `
    <div class="shell detail-shell">
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

      <div class="track-list">
        ${
          tracks.length
            ? tracks.map((t, i) => trackRow(t, i)).join('')
            : '<p class="empty">No tracks in this playlist.</p>'
        }
      </div>
    </div>
  `

  document.getElementById('back-btn')!.addEventListener('click', () => {
    renderDashboard()
  })
}

async function openPlaylist(playlistId: string): Promise<void> {
  const playlist = playlists.find((p) => p.id === playlistId)
  if (!playlist) return

  showLoading(`Loading “${playlist.name}”…`)

  try {
    const tracks = await getPlaylistTracks(playlistId)
    renderPlaylistDetail(playlist, tracks)
  } catch (e) {
    renderDashboard()
    showError(e)
  }
}

function renderDashboard(): void {
  const visible = filteredPlaylists()

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

      ${statsHtml(playlists)}

      <div class="toolbar">
        <input
          type="search"
          id="search"
          placeholder="Search playlists or owners…"
          value="${escapeHtml(searchQuery)}"
        />
        <div class="filters" role="tablist">
          ${(['all', 'yours', 'collaborative', 'followed'] as const)
            .map(
              (f) => `
            <button
              type="button"
              class="filter-btn ${activeFilter === f ? 'active' : ''}"
              data-filter="${f}"
            >${f === 'all' ? 'All' : formatKind(f)}</button>
          `
            )
            .join('')}
        </div>
      </div>

      <p class="results-count">${visible.length} playlist${visible.length === 1 ? '' : 's'}</p>

      <div class="grid">
        ${
          visible.length
            ? visible.map(playlistCard).join('')
            : '<p class="empty">No playlists match your filters.</p>'
        }
      </div>
    </div>
  `

  document.getElementById('logout-btn')!.addEventListener('click', () => {
    clearAuth()
    playlists = []
    userImages = null
    renderLogin(!isConfigured())
  })

  document.getElementById('search')!.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value
    renderDashboard()
  })

  document.querySelectorAll<HTMLButtonElement>('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter as Filter
      renderDashboard()
    })
  })

  document.querySelectorAll<HTMLButtonElement>('.card[data-playlist-id]').forEach(
    (card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.playlistId
        if (id) openPlaylist(id)
      })
    }
  )
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

  showLoading('Loading your playlists…')

  try {
    const user = await getCurrentUser()
    userId = user.id
    playlists = await getAllPlaylists()
    displayName = user.display_name ?? user.id
    userImages = user.images
    renderDashboard()
  } catch (e) {
    clearAuth()
    renderLogin(false)
    showError(e)
  }
}

boot()
