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
  getPlaylistTracks,
  spotifyFetch,
  type PlaylistKind,
} from './spotify/api'
import { renderDiscoverView } from './discover/view'
import { renderPlaylistDetail } from './playlist/detailView'
import { IMAGE_SIZES, renderImg } from './spotify/images'
import type { SpotifyImage } from './spotify/images'
import type { SpotifyPlaylist } from './spotify/types'

const app = document.querySelector<HTMLDivElement>('#app')!

type Filter = 'all' | PlaylistKind
type AppView = 'dashboard' | 'discover' | 'detail'

let playlists: SpotifyPlaylist[] = []
let userId = ''
let activeFilter: Filter = 'all'
let searchQuery = ''
let displayName = ''
let userImages: SpotifyImage[] | null = null
let userMarket = 'US'
let currentView: AppView = 'dashboard'

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
      }
    } catch (e) {
      if (currentView === 'discover') openDiscover()
      else renderDashboard()
      showError(e)
      return
    }
  }

  currentView = 'detail'
  showLoading(`Loading “${playlist.name}”…`)

  try {
    const tracks = await getPlaylistTracks(playlistId, userMarket)
    renderPlaylistDetail(
      app,
      playlist,
      tracks,
      classifyPlaylist(playlist, userId),
      userMarket,
      () => {
        currentView = 'dashboard'
        renderDashboard()
      }
    )
  } catch (e) {
    currentView = 'dashboard'
    renderDashboard()
    showError(e)
  }
}

function renderDashboard(): void {
  currentView = 'dashboard'
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

      <div class="nav-tabs">
        <button type="button" class="nav-tab active" disabled>Playlists</button>
        <button type="button" class="nav-tab" id="discover-tab">Discover Daily</button>
      </div>

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

  document.getElementById('discover-tab')!.addEventListener('click', () => {
    openDiscover()
  })

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

  if (needsReauth()) {
    clearAuth()
    renderLogin(false, true)
    return
  }

  showLoading('Loading your playlists…')

  try {
    const user = await getCurrentUser()
    userId = user.id
    playlists = await getAllPlaylists()
    displayName = user.display_name ?? user.id
    userImages = user.images
    userMarket = user.country ?? 'US'
    renderDashboard()
  } catch (e) {
    clearAuth()
    renderLogin(false)
    showError(e)
  }
}

boot()
