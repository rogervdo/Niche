import { spotifyErrorMessage } from '../spotify/api'
import { buildOwnPlaylistTrackIndex, type PlaylistRef } from './trackPlaylistIndex'
import type {
  PlaylistTrackEntry,
  SpotifyPlaylist,
  SpotifyTrack,
} from '../spotify/types'

type Member = { track: SpotifyTrack; playlists: PlaylistRef[] }

type Failure = { playlist: PlaylistRef; message: string }

export type LikedSongsMembership = {
  total: number
  orphanCount: number
  memberCount: number
  orphans: SpotifyTrack[]
  members: Member[]
}

export type LikedSongsAnalysisPageOpts = {
  userId: string
  market: string
  playlists: SpotifyPlaylist[]
  archivedPlaylistIds: ReadonlySet<string>
  getLikedEntries: () => Promise<PlaylistTrackEntry[]>
  isPlaylistArchived?: (playlistId: string) => boolean
  onOpenPlaylist?: (playlistId: string) => void
  onBack: () => void
}

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

function artistLabel(track: SpotifyTrack): string {
  return track.artists.map((a) => a.name).join(', ')
}

function plural(n: number): string {
  return n === 1 ? '' : 's'
}

function byNameThenArtist(a: SpotifyTrack, b: SpotifyTrack): number {
  return (
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
    artistLabel(a).localeCompare(artistLabel(b), undefined, { sensitivity: 'base' })
  )
}

export function analyzeMembership(
  entries: PlaylistTrackEntry[],
  index: Map<string, PlaylistRef[]>,
  isArchived?: (playlistId: string) => boolean
): LikedSongsMembership {
  const orphans: SpotifyTrack[] = []
  const members: Member[] = []

  for (const entry of entries) {
    const refs = (index.get(entry.track.id) ?? [])
      .filter((p) => !isArchived?.(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    if (refs.length) members.push({ track: entry.track, playlists: refs })
    else orphans.push(entry.track)
  }

  orphans.sort(byNameThenArtist)
  members.sort((a, b) => byNameThenArtist(a.track, b.track))

  return {
    total: entries.length,
    orphanCount: orphans.length,
    memberCount: members.length,
    orphans,
    members,
  }
}

function matchesQuery(track: SpotifyTrack, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const artists = track.artists.map((a) => a.name).join(' ')
  return `${track.name} ${artists} ${track.album.name}`.toLowerCase().includes(q)
}

function trackRowHtml(track: SpotifyTrack, playlists: PlaylistRef[] | null): string {
  const tags = playlists?.length
    ? `<div class="analyze-liked-tags">${playlists
        .map(
          (p) => `
        <button
          type="button"
          class="track-playlist-tag"
          data-open-playlist="${p.id}"
          title="Open ${escapeHtml(p.name)}"
        >${escapeHtml(p.name)}</button>
      `
        )
        .join('')}</div>`
    : ''

  return `
    <li class="analyze-liked-row">
      <div class="analyze-liked-meta">
        <span class="analyze-liked-name">${escapeHtml(track.name)}</span>
        <span class="analyze-liked-artist">${escapeHtml(artistLabel(track))} · ${escapeHtml(track.album.name)}</span>
      </div>
      ${tags}
    </li>
  `
}

export function renderLikedSongsAnalysisPage(
  root: HTMLElement,
  opts: LikedSongsAnalysisPageOpts
): void {
  const {
    userId,
    market,
    playlists,
    archivedPlaylistIds,
    getLikedEntries,
    isPlaylistArchived,
    onOpenPlaylist,
    onBack,
  } = opts

  let query = ''

  root.innerHTML = `
    <div class="shell analysis-shell">
      <button type="button" class="btn-back" id="analysis-back-btn">← Back to Liked Songs</button>
      <header class="analysis-header">
        <span class="badge badge-liked">Liked</span>
        <h1>Liked songs in your playlists</h1>
        <p class="analysis-sub">Which of your own playlists each liked song appears in. Archived playlists are skipped.</p>
      </header>
      <div class="analysis-body" id="analysis-body"></div>
    </div>
  `

  root.querySelector('#analysis-back-btn')?.addEventListener('click', () => onBack())

  const body = root.querySelector<HTMLElement>('#analysis-body')!

  const renderStatus = (message: string): void => {
    body.innerHTML = `<p class="analysis-status">${escapeHtml(message)}</p>`
  }

  const renderProgress = (done: number, total: number): void => {
    const pct = total ? Math.round((done / total) * 100) : 0
    body.innerHTML = `
      <div class="analysis-progress-wrap">
        <p class="analysis-status">Scanning ${total} playlist${plural(total)}… ${done}/${total}</p>
        <div class="analysis-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}">
          <div class="analysis-progress-fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `
  }

  const renderError = (message: string): void => {
    body.innerHTML = `
      <div class="analysis-error">
        <p class="analysis-status">${escapeHtml(message)}</p>
        <button type="button" class="btn-ghost" id="analysis-retry-btn">Try again</button>
      </div>
    `
    body.querySelector('#analysis-retry-btn')?.addEventListener('click', () => void run(false))
  }

  const bindTagClicks = (): void => {
    body.querySelectorAll<HTMLButtonElement>('.track-playlist-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.openPlaylist
        if (id) onOpenPlaylist?.(id)
      })
    })
  }

  const updateLists = (result: LikedSongsMembership): void => {
    const orphans = result.orphans.filter((t) => matchesQuery(t, query))
    const members = result.members.filter((m) => matchesQuery(m.track, query))

    const orphanTitle = body.querySelector('#analysis-orphans-title')
    const orphanList = body.querySelector('#analysis-orphans-list')
    const memberTitle = body.querySelector('#analysis-members-title')
    const memberList = body.querySelector('#analysis-members-list')

    if (orphanTitle) {
      orphanTitle.textContent = `Not in any playlist (${orphans.length} of ${result.orphanCount})`
    }
    if (memberTitle) {
      memberTitle.textContent = `In your playlists (${members.length} of ${result.memberCount})`
    }
    if (orphanList) {
      orphanList.innerHTML = orphans.length
        ? `<ul class="analyze-liked-list">${orphans.map((t) => trackRowHtml(t, null)).join('')}</ul>`
        : '<p class="analyzer-empty">Every liked song is in at least one of your playlists.</p>'
    }
    if (memberList) {
      memberList.innerHTML = members.length
        ? `<ul class="analyze-liked-list">${members.map((m) => trackRowHtml(m.track, m.playlists)).join('')}</ul>`
        : '<p class="analyzer-empty">None of your liked songs are in any of your playlists.</p>'
    }

    bindTagClicks()
  }

  const renderResults = (result: LikedSongsMembership, failures: Failure[]): void => {
    const failureNote = failures.length
      ? `<div class="analysis-failures">
          <p class="analysis-failures-title">Couldn't check ${failures.length} playlist${plural(failures.length)} (Spotify rate limit or error):</p>
          <ul class="analysis-failures-list">
            ${failures.map((f) => `<li>${escapeHtml(f.playlist.name)} — ${escapeHtml(f.message)}</li>`).join('')}
          </ul>
          <button type="button" class="btn-ghost" id="analysis-rescan-btn">Retry scan</button>
        </div>`
      : ''

    body.innerHTML = `
      <div class="analysis-results">
        <p class="analysis-summary">
          ${result.total} liked song${plural(result.total)} · ${result.orphanCount} not in any playlist · ${result.memberCount} in at least one.
        </p>
        ${failureNote}
        <input
          type="search"
          class="cart-form-input analysis-search"
          id="analysis-search"
          placeholder="Filter songs by name or artist…"
          value="${escapeHtml(query)}"
          autocomplete="off"
        />
        <section class="analyzer-section" aria-labelledby="analysis-orphans-title">
          <h3 class="analyzer-section-title" id="analysis-orphans-title"></h3>
          <div id="analysis-orphans-list"></div>
        </section>
        <section class="analyzer-section" aria-labelledby="analysis-members-title">
          <h3 class="analyzer-section-title" id="analysis-members-title"></h3>
          <div id="analysis-members-list"></div>
        </section>
      </div>
    `

    updateLists(result)

    body.querySelector<HTMLInputElement>('#analysis-search')?.addEventListener('input', (e) => {
      query = (e.target as HTMLInputElement).value
      updateLists(result)
    })

    body.querySelector('#analysis-rescan-btn')?.addEventListener('click', () => void run(true))
  }

  async function run(force: boolean): Promise<void> {
    renderStatus('Loading your liked songs…')

    let entries: PlaylistTrackEntry[]
    try {
      entries = await getLikedEntries()
    } catch (err) {
      renderError(spotifyErrorMessage(err))
      return
    }

    renderStatus('Scanning your playlists…')

    const failures: Failure[] = []
    let index: Map<string, PlaylistRef[]>
    try {
      index = await buildOwnPlaylistTrackIndex(
        playlists,
        userId,
        market,
        archivedPlaylistIds,
        {
          force,
          onProgress: (done, total) => renderProgress(done, total),
          onFailure: (playlist, message) => failures.push({ playlist, message }),
        }
      )
    } catch (err) {
      renderError(spotifyErrorMessage(err))
      return
    }

    const result = analyzeMembership(entries, index, isPlaylistArchived)
    renderResults(result, failures)
  }

  void run(false)
}
