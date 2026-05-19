import { generateDiscoverPlaylist } from './engine'
import {
  generatePlaylist,
  getUser,
  isBackendAvailable,
  restoreUserOptions,
  saveUserOptions,
  subscribe,
  unsubscribe,
  type PublicUser,
} from '../api/client'
import { getAccessToken, getRefreshToken } from '../spotify/auth'
import {
  DEFAULT_OPTIONS,
  formatListenerCap,
  listenerCapToSliderIndex,
  LISTENER_CAP_STEPS,
  loadOptions,
  saveOptions,
  sliderIndexToListenerCap,
  type PlaylistOptions,
} from './options'

function dailySection(): string {
  if (!backendReady) {
    return `
      <section class="discover-panel discover-panel-muted">
        <h2>Daily auto-update</h2>
        <p class="panel-desc">Start the API server (<code>npm run dev:api</code>) to enable scheduled daily playlist updates.</p>
      </section>
    `
  }

  if (subscribedUser) {
    return `
      <section class="discover-panel discover-panel-success">
        <h2>Daily auto-update <span class="badge badge-on">Enabled</span></h2>
        <p class="panel-desc">
          Your <strong>Niche Daily</strong> playlist updates automatically each morning.
          Last updated: ${formatLastUpdated(subscribedUser.lastUpdated)}.
        </p>
        <button type="button" class="btn-ghost" id="unsubscribe-btn">Disable daily updates</button>
      </section>
    `
  }

  return `
    <section class="discover-panel">
      <h2>Daily auto-update</h2>
      <p class="panel-desc">
        Save your refresh token on the server and regenerate <strong>Niche Daily</strong> every day.
      </p>
      <button type="button" class="btn-ghost" id="subscribe-btn">Enable daily updates</button>
    </section>
  `
}

function formatLastUpdated(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

let options: PlaylistOptions = loadOptions()
let backendReady = false
let subscribedUser: PublicUser | null = null

async function loadBackendState(userId: string): Promise<void> {
  backendReady = await isBackendAvailable()
  subscribedUser = backendReady ? (await getUser(userId))?.user ?? null : null
  if (subscribedUser) {
    options = {
      ...subscribedUser.playlistOptions,
      anchorArtistIds: [...(subscribedUser.playlistOptions.anchorArtistIds ?? [])],
      genres: [...(subscribedUser.playlistOptions.genres ?? [])],
    }
  } else {
    options = loadOptions()
  }
}

async function persistOptions(userId: string): Promise<void> {
  if (subscribedUser) {
    const accessToken = await getAccessToken()
    subscribedUser = await saveUserOptions(userId, accessToken, options)
  } else {
    saveOptions(options)
  }
}

export async function renderDiscoverView(
  root: HTMLElement,
  userId: string,
  market: string,
  onBack: () => void,
  onOpenPlaylist: (playlistId: string) => void
): Promise<void> {
  await loadBackendState(userId)

  const [popMin, popMax] = options.artistPopularity
  const maxListenersIdx = listenerCapToSliderIndex(options.maxListeners)
  const genresValue = options.genres.join(', ')
  const anchorsValue = options.anchorArtistIds.join('\n')

  root.innerHTML = `
    <div class="shell discover-shell">
      <button type="button" class="btn-back" id="discover-back">← Back to playlists</button>

      <header class="discover-header">
        <p class="eyebrow">Discover Daily</p>
        <h1>New niche artists</h1>
        <p class="lede">
          Discovers <strong>new artists</strong> by genre search — not your listening history.
          Optionally branch from anchor artists you choose (their related artists; anchors won’t appear on the playlist).
        </p>
      </header>

      ${dailySection()}

      <section class="discover-panel">
        <h2>Genres</h2>
        <p class="panel-desc">Required unless you only use anchors. Comma-separated (e.g. <code>country, edm</code>).</p>
        <input type="text" class="genre-input" id="genre-input" value="${genresValue.replace(/"/g, '&quot;')}" placeholder="country, edm" />
      </section>

      <section class="discover-panel">
        <h2>Anchor artists <span class="hint">(optional, max 5)</span></h2>
        <p class="panel-desc">
          Spotify artist ID or link per line — we find <strong>related</strong> artists (e.g. paste a favorite niche act to explore their orbit).
        </p>
        <textarea class="anchor-input" id="anchor-input" rows="4" placeholder="https://open.spotify.com/artist/...">${anchorsValue.replace(/</g, '&lt;')}</textarea>
      </section>

      <section class="discover-panel">
        <h2>Artist popularity</h2>
        <p class="panel-desc">Spotify score 0–100. Niche sweet spot is usually 20–65.</p>
        <div class="range-group">
          <div class="range-header">
            <span>Popularity band</span>
            <span class="range-values" id="artist-pop-label">${popMin} – ${popMax}</span>
          </div>
          <div class="range-inputs">
            <input type="range" min="0" max="100" value="${popMin}" id="artist-pop-min" />
            <input type="range" min="0" max="100" value="${popMax}" id="artist-pop-max" />
          </div>
        </div>
      </section>

      <section class="discover-panel">
        <h2>Max listeners</h2>
        <p class="panel-desc">Caps artist size by Spotify follower count (proxy — the API does not expose monthly listeners).</p>
        <div class="range-group">
          <div class="range-header">
            <span>Follower ceiling</span>
            <span class="range-values" id="max-listeners-label">${formatListenerCap(options.maxListeners)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="${LISTENER_CAP_STEPS.length - 1}"
            value="${maxListenersIdx}"
            id="max-listeners"
          />
        </div>
      </section>

      <div class="discover-actions">
        <button type="button" class="btn-spotify" id="generate-btn">Generate Niche Daily</button>
        <button type="button" class="btn-ghost" id="reset-options">Reset defaults</button>
        <p class="discover-note" id="discover-status"></p>
      </div>
    </div>
  `

  document.getElementById('discover-back')!.addEventListener('click', onBack)

  const syncOptionsFromDom = (): void => {
    const rawGenres = (document.getElementById('genre-input') as HTMLInputElement).value
    options.genres = rawGenres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean)

    const rawAnchors = (document.getElementById('anchor-input') as HTMLTextAreaElement).value
    options.anchorArtistIds = rawAnchors
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    const minEl = document.getElementById('artist-pop-min') as HTMLInputElement
    const maxEl = document.getElementById('artist-pop-max') as HTMLInputElement
    let min = Number(minEl.value)
    let max = Number(maxEl.value)
    if (min > max) [min, max] = [max, min]
    options.artistPopularity = [min, max]
    minEl.value = String(min)
    maxEl.value = String(max)
    const label = document.getElementById('artist-pop-label')
    if (label) label.textContent = `${min} – ${max}`

    const listenersIdx = Number(
      (document.getElementById('max-listeners') as HTMLInputElement).value
    )
    options.maxListeners = sliderIndexToListenerCap(listenersIdx)
    const listenersLabel = document.getElementById('max-listeners-label')
    if (listenersLabel) {
      listenersLabel.textContent = formatListenerCap(options.maxListeners)
    }

    void persistOptions(userId)
  }

  document.getElementById('genre-input')!.addEventListener('change', syncOptionsFromDom)
  document.getElementById('anchor-input')!.addEventListener('change', syncOptionsFromDom)
  document.getElementById('artist-pop-min')!.addEventListener('input', syncOptionsFromDom)
  document.getElementById('artist-pop-max')!.addEventListener('input', syncOptionsFromDom)
  document.getElementById('max-listeners')!.addEventListener('input', syncOptionsFromDom)

  document.getElementById('reset-options')!.addEventListener('click', async () => {
    if (subscribedUser) {
      const accessToken = await getAccessToken()
      subscribedUser = await restoreUserOptions(userId, accessToken)
      options = {
        ...subscribedUser.playlistOptions,
        anchorArtistIds: [...(subscribedUser.playlistOptions.anchorArtistIds ?? [])],
        genres: [...(subscribedUser.playlistOptions.genres ?? [])],
      }
    } else {
      options = {
        ...DEFAULT_OPTIONS,
        anchorArtistIds: [...DEFAULT_OPTIONS.anchorArtistIds],
        genres: [...DEFAULT_OPTIONS.genres],
      }
      saveOptions(options)
    }
    await renderDiscoverView(root, userId, market, onBack, onOpenPlaylist)
  })

  document.getElementById('subscribe-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('subscribe-btn') as HTMLButtonElement
    const status = document.getElementById('discover-status')!
    btn.disabled = true
    status.textContent = 'Enabling daily updates…'

    try {
      const refreshToken = getRefreshToken()
      if (!refreshToken) {
        throw new Error('No refresh token. Disconnect and connect again.')
      }
      syncOptionsFromDom()
      subscribedUser = await subscribe(userId, refreshToken, options)
      status.textContent = 'Daily updates enabled. Your Niche Daily playlist was generated.'
      status.className = 'discover-note discover-note-success'
      await renderDiscoverView(root, userId, market, onBack, onOpenPlaylist)
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e)
      status.className = 'discover-note discover-note-error'
      btn.disabled = false
    }
  })

  document.getElementById('unsubscribe-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('unsubscribe-btn') as HTMLButtonElement
    btn.disabled = true
    try {
      const accessToken = await getAccessToken()
      await unsubscribe(userId, accessToken)
      subscribedUser = null
      await renderDiscoverView(root, userId, market, onBack, onOpenPlaylist)
    } catch (e) {
      const status = document.getElementById('discover-status')!
      status.textContent = e instanceof Error ? e.message : String(e)
      status.className = 'discover-note discover-note-error'
      btn.disabled = false
    }
  })

  document.getElementById('generate-btn')!.addEventListener('click', async () => {
    syncOptionsFromDom()
    const btn = document.getElementById('generate-btn') as HTMLButtonElement
    const status = document.getElementById('discover-status')!
    btn.disabled = true
    status.textContent = 'Finding niche artists…'
    status.className = 'discover-note'

    try {
      await persistOptions(userId)

      const result =
        subscribedUser && backendReady
          ? await generatePlaylist(userId, market)
          : await generateDiscoverPlaylist(userId, options, market)

      const genreNote =
        result.targetGenres?.length
          ? ` Genres: ${result.targetGenres.join(', ')}.`
          : ''
      status.innerHTML = `Added <strong>${result.trackCount}</strong> tracks from <strong>${result.artistCount ?? result.trackCount}</strong> new artists.${genreNote} <a href="${result.playlistUrl}" target="_blank" rel="noreferrer">Open in Spotify</a> or <button type="button" class="link-btn" id="view-generated">view here</button>.`
      status.className = 'discover-note discover-note-success'
      document.getElementById('view-generated')?.addEventListener('click', () => {
        onOpenPlaylist(result.playlistId)
      })

      if (subscribedUser) {
        subscribedUser = {
          ...subscribedUser,
          playlistId: result.playlistId,
          lastUpdated: new Date().toISOString(),
        }
      }
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e)
      status.className = 'discover-note discover-note-error'
    } finally {
      btn.disabled = false
    }
  })
}
