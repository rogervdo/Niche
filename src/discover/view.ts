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
  ALL_SEEDS,
  DEFAULT_OPTIONS,
  loadOptions,
  saveOptions,
  SEED_LABELS,
  type PlaylistOptions,
  type SeedCode,
} from './options'

type RangeKey =
  | 'acousticness'
  | 'danceability'
  | 'energy'
  | 'instrumentalness'
  | 'popularity'
  | 'valence'

const RANGE_LABELS: Record<RangeKey, string> = {
  acousticness: 'Acousticness',
  danceability: 'Danceability',
  energy: 'Energy',
  instrumentalness: 'Instrumentalness',
  popularity: 'Popularity',
  valence: 'Valence (mood)',
}

let options: PlaylistOptions = loadOptions()
let backendReady = false
let subscribedUser: PublicUser | null = null

function formatLastUpdated(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

function rangeRow(key: RangeKey, min: number, max: number): string {
  const label = RANGE_LABELS[key]
  return `
    <div class="range-group">
      <div class="range-header">
        <span>${label}</span>
        <span class="range-values" data-range-label="${key}">${min} – ${max}</span>
      </div>
      <div class="range-inputs">
        <input type="range" min="0" max="100" value="${min}" data-range="${key}" data-bound="min" />
        <input type="range" min="0" max="100" value="${max}" data-range="${key}" data-bound="max" />
      </div>
    </div>
  `
}

function seedSlot(index: number, value: SeedCode): string {
  const opts = ALL_SEEDS.map(
    (s) =>
      `<option value="${s}" ${s === value ? 'selected' : ''}>${SEED_LABELS[s]}</option>`
  ).join('')
  return `
    <label class="seed-slot">
      <span class="seed-slot-label">Seed ${index + 1}</span>
      <select data-seed-index="${index}">${opts}</select>
    </label>
  `
}

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
        Save your refresh token on the server and regenerate <strong>Niche Daily</strong> every day — like
        <a href="https://github.com/ethanzohar/discoverify" target="_blank" rel="noreferrer">discoverify</a>.
      </p>
      <button type="button" class="btn-ghost" id="subscribe-btn">Enable daily updates</button>
    </section>
  `
}

async function loadBackendState(userId: string): Promise<void> {
  backendReady = await isBackendAvailable()
  subscribedUser = backendReady ? (await getUser(userId))?.user ?? null : null
  if (subscribedUser) {
    options = {
      ...subscribedUser.playlistOptions,
      seeds: [...subscribedUser.playlistOptions.seeds],
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

  root.innerHTML = `
    <div class="shell discover-shell">
      <button type="button" class="btn-back" id="discover-back">← Back to playlists</button>

      <header class="discover-header">
        <p class="eyebrow">Discover Daily</p>
        <h1>Generate your playlist</h1>
        <p class="lede">
          Inspired by
          <a href="https://github.com/ethanzohar/discoverify" target="_blank" rel="noreferrer">discoverify</a>:
          random seeds from your top music → 30-track <strong>Niche Daily</strong> playlist.
          Uses Spotify Recommendations when available; otherwise related artists &amp; top tracks.
        </p>
      </header>

      ${dailySection()}

      <section class="discover-panel">
        <h2>Seeds <span class="hint">(max 5 — Spotify limit)</span></h2>
        <p class="panel-desc">Each slot picks one random artist or track from that time range.</p>
        <div class="seed-grid">
          ${options.seeds.map((s, i) => seedSlot(i, s)).join('')}
        </div>
        <div class="seed-actions">
          <button type="button" class="btn-ghost" id="add-seed" ${options.seeds.length >= 5 ? 'disabled' : ''}>Add seed</button>
          <button type="button" class="btn-ghost" id="remove-seed" ${options.seeds.length <= 1 ? 'disabled' : ''}>Remove seed</button>
          <button type="button" class="btn-ghost" id="reset-seeds">Reset defaults</button>
        </div>
      </section>

      <section class="discover-panel">
        <h2>Mood &amp; style</h2>
        <p class="panel-desc">Used with Recommendations API. Popularity always applies; other sliders need that API.</p>
        <div class="range-grid">
          ${(Object.keys(RANGE_LABELS) as RangeKey[])
            .map((k) => rangeRow(k, options[k][0], options[k][1]))
            .join('')}
        </div>
      </section>

      <div class="discover-actions">
        <button type="button" class="btn-spotify" id="generate-btn">Generate Niche Daily</button>
        <p class="discover-note" id="discover-status"></p>
      </div>
    </div>
  `

  document.getElementById('discover-back')!.addEventListener('click', onBack)

  const syncOptionsFromDom = (): void => {
    options.seeds = Array.from(
      root.querySelectorAll<HTMLSelectElement>('[data-seed-index]'),
      (el) => el.value as SeedCode
    )
    for (const key of Object.keys(RANGE_LABELS) as RangeKey[]) {
      const minEl = root.querySelector<HTMLInputElement>(
        `[data-range="${key}"][data-bound="min"]`
      )!
      const maxEl = root.querySelector<HTMLInputElement>(
        `[data-range="${key}"][data-bound="max"]`
      )!
      let min = Number(minEl.value)
      let max = Number(maxEl.value)
      if (min > max) [min, max] = [max, min]
      options[key] = [min, max]
      minEl.value = String(min)
      maxEl.value = String(max)
      const label = root.querySelector(`[data-range-label="${key}"]`)
      if (label) label.textContent = `${min} – ${max}`
    }
    void persistOptions(userId)
  }

  root.querySelectorAll<HTMLSelectElement>('[data-seed-index]').forEach((el) => {
    el.addEventListener('change', syncOptionsFromDom)
  })

  root.querySelectorAll<HTMLInputElement>('[data-range]').forEach((el) => {
    el.addEventListener('input', syncOptionsFromDom)
  })

  document.getElementById('add-seed')!.addEventListener('click', () => {
    if (options.seeds.length >= 5) return
    options.seeds.push('ST')
    void persistOptions(userId).then(() =>
      renderDiscoverView(root, userId, market, onBack, onOpenPlaylist)
    )
  })

  document.getElementById('remove-seed')!.addEventListener('click', () => {
    if (options.seeds.length <= 1) return
    options.seeds.pop()
    void persistOptions(userId).then(() =>
      renderDiscoverView(root, userId, market, onBack, onOpenPlaylist)
    )
  })

  document.getElementById('reset-seeds')!.addEventListener('click', async () => {
    if (subscribedUser) {
      const accessToken = await getAccessToken()
      subscribedUser = await restoreUserOptions(userId, accessToken)
      options = {
        ...subscribedUser.playlistOptions,
        seeds: [...subscribedUser.playlistOptions.seeds],
      }
    } else {
      options = {
        ...DEFAULT_OPTIONS,
        seeds: [...DEFAULT_OPTIONS.seeds],
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
    status.textContent = 'Building your playlist…'
    status.className = 'discover-note'

    try {
      await persistOptions(userId)

      const result =
        subscribedUser && backendReady
          ? await generatePlaylist(userId, market)
          : await generateDiscoverPlaylist(userId, options, market)

      const modeNote =
        result.mode === 'recommendations'
          ? 'Used Spotify Recommendations.'
          : 'Used related artists (Recommendations API unavailable for this app).'
      status.innerHTML = `Created <strong>${result.trackCount}</strong> tracks in <strong>Niche Daily</strong>. ${modeNote} <a href="${result.playlistUrl}" target="_blank" rel="noreferrer">Open in Spotify</a> or <button type="button" class="link-btn" id="view-generated">view here</button>.`
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
