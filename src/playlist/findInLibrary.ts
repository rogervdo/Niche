import { getPlaylistTrackEntries, spotifyErrorMessage } from '../spotify/api'
import {
  getCachedPlaylistEntries,
  setCachedEntries,
} from '../spotify/playlistCache'
import { normalizeTrackTitle } from '../spotify/trackMatch'
import type { PlaylistTrackEntry, SpotifyPlaylist, SpotifyTrack } from '../spotify/types'
import {
  bindPlaylistSearch,
  bindRecentPlaylists,
  filterRecentPlaylists,
  recentPlaylistsHtml,
} from './playlistPickerUi'
import { loadRecent, pushRecentPlaylist, type RecentPlaylistItem } from './recentActivity'

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

function showModal(html: string): { close: () => void; overlay: HTMLElement } {
  document.querySelectorAll('.find-library-modal-overlay').forEach((el) => el.remove())
  const overlay = document.createElement('div')
  overlay.className = 'replace-modal-overlay find-library-modal-overlay'
  overlay.innerHTML = html
  document.body.appendChild(overlay)

  const close = () => overlay.remove()

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  return { close, overlay }
}

function findMatchingEntries(
  entries: PlaylistTrackEntry[],
  track: SpotifyTrack
): PlaylistTrackEntry[] {
  const key = normalizeTrackTitle(track.name)
  if (!key) return []
  return entries.filter((e) => normalizeTrackTitle(e.track.name) === key)
}

function playlistPickerRow(p: SpotifyPlaylist): string {
  const owner = p.owner?.display_name ?? p.owner?.id ?? 'Unknown'
  return `
    <button type="button" class="cart-playlist-pick" data-playlist-id="${p.id}">
      <span class="cart-playlist-pick-meta">
        <span class="cart-playlist-pick-name">${escapeHtml(p.name)}</span>
        <span class="cart-playlist-pick-sub">${escapeHtml(owner)} · ${p.tracks.total} tracks</span>
      </span>
    </button>
  `
}

function pickerModalHtml(
  trackName: string,
  playlists: SpotifyPlaylist[],
  recentItems: RecentPlaylistItem[]
): string {
  return `
    <div class="replace-modal find-library-modal cart-modal-wide" role="dialog" aria-labelledby="find-library-title">
      <h2 id="find-library-title" class="replace-modal-title">Check another playlist</h2>
      <p class="replace-modal-hint">
        Look for “${escapeHtml(trackName)}” (normalized title) in one playlist:
      </p>
      <input
        type="search"
        class="cart-form-input cart-playlist-search"
        id="find-library-search"
        placeholder="Search your playlists…"
        autocomplete="off"
      />
      ${recentPlaylistsHtml(recentItems)}
      <div class="cart-playlist-picks" id="find-library-picks">
        ${playlists.map(playlistPickerRow).join('')}
      </div>
      <div class="replace-modal-actions">
        <button type="button" class="btn-replace-cancel" id="find-library-close">Cancel</button>
      </div>
    </div>
  `
}

function loadingModalHtml(playlistName: string, trackName: string): string {
  return `
    <div class="replace-modal find-library-modal" role="dialog">
      <h2 class="replace-modal-title">Checking playlist</h2>
      <p class="replace-modal-body">Looking for “${escapeHtml(trackName)}” in “${escapeHtml(playlistName)}”…</p>
    </div>
  `
}

function resultsModalHtml(
  track: SpotifyTrack,
  playlist: SpotifyPlaylist,
  matches: PlaylistTrackEntry[]
): string {
  const list = matches
    .map((e) => {
      const t = e.track
      const artists = t.artists.map((a) => a.name).join(', ')
      return `
        <li class="find-library-match">
          <span class="find-library-match-name">${escapeHtml(t.name)}</span>
          <span class="find-library-match-meta">${escapeHtml(artists)} · ${escapeHtml(t.album.name)}</span>
        </li>
      `
    })
    .join('')

  return `
    <div class="replace-modal find-library-modal" role="dialog">
      <h2 class="replace-modal-title">Found in “${escapeHtml(playlist.name)}”</h2>
      <p class="replace-modal-body">
        ${matches.length} track${matches.length === 1 ? '' : 's'} matching “<strong>${escapeHtml(track.name)}</strong>”:
      </p>
      <ul class="find-library-list find-library-match-list">${list}</ul>
      <div class="replace-modal-actions">
        <button type="button" class="btn-replace-cancel" id="find-library-close">Done</button>
        <button type="button" class="btn-replace-confirm" id="find-library-open">Open playlist</button>
      </div>
    </div>
  `
}

function emptyModalHtml(trackName: string, playlistName: string): string {
  return `
    <div class="replace-modal find-library-modal" role="dialog">
      <h2 class="replace-modal-title">Not in this playlist</h2>
      <p class="replace-modal-body">
        No track in “${escapeHtml(playlistName)}” matches “${escapeHtml(trackName)}” by normalized title.
      </p>
      <div class="replace-modal-actions">
        <button type="button" class="btn-replace-cancel" id="find-library-close">OK</button>
      </div>
    </div>
  `
}

function bindPicker(
  overlay: HTMLElement,
  close: () => void,
  userId: string,
  others: SpotifyPlaylist[],
  currentPlaylistId: string,
  onPick: (playlistId: string) => void
): void {
  const dialog = overlay.querySelector<HTMLElement>('.find-library-modal')
  if (!dialog) return

  dialog.querySelector('#find-library-close')?.addEventListener('click', close)

  const picksEl = dialog.querySelector<HTMLElement>('#find-library-picks')
  const searchInput = dialog.querySelector<HTMLInputElement>('#find-library-search')

  if (searchInput && picksEl) {
    bindPlaylistSearch(searchInput, picksEl)
    searchInput.focus()
  }

  const allowedIds = new Set(others.map((p) => p.id))
  bindRecentPlaylists(
    dialog,
    filterRecentPlaylists(loadRecent(userId), allowedIds, currentPlaylistId),
    onPick
  )

  picksEl?.querySelectorAll<HTMLButtonElement>('.cart-playlist-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.playlistId
      if (id) onPick(id)
    })
  })
}

export function runFindInLibraryFlow(opts: {
  track: SpotifyTrack
  currentPlaylistId: string
  playlists: SpotifyPlaylist[]
  market: string
  userId: string
  onOpenPlaylist?: (playlistId: string) => void
}): void {
  const { track, currentPlaylistId, playlists, market, userId, onOpenPlaylist } = opts
  const others = playlists.filter((p) => p.id !== currentPlaylistId)

  if (!others.length) {
    const { close, overlay } = showModal(`
      <div class="replace-modal find-library-modal" role="dialog">
        <h2 class="replace-modal-title">No other playlists</h2>
        <p class="replace-modal-body">You only have this playlist in your library.</p>
        <div class="replace-modal-actions">
          <button type="button" class="btn-replace-cancel" id="find-library-close">OK</button>
        </div>
      </div>
    `)
    overlay.querySelector('#find-library-close')?.addEventListener('click', close)
    return
  }

  const allowedIds = new Set(others.map((p) => p.id))
  const recentItems = filterRecentPlaylists(
    loadRecent(userId),
    allowedIds,
    currentPlaylistId
  )
  let modal = showModal(pickerModalHtml(track.name, others, recentItems))

  const checkPlaylist = (playlistId: string) => {
    const playlist = playlists.find((p) => p.id === playlistId)
    if (!playlist) return

    pushRecentPlaylist(userId, playlist.id, playlist.name)

    modal.close()
    modal = showModal(loadingModalHtml(playlist.name, track.name))

    void (async () => {
      try {
        let entries = getCachedPlaylistEntries(playlistId, market)
        if (!entries) {
          entries = await getPlaylistTrackEntries(playlistId, market)
          setCachedEntries(playlistId, market, entries)
        }

        const matches = findMatchingEntries(entries, track)
        modal.close()

        if (!matches.length) {
          modal = showModal(emptyModalHtml(track.name, playlist.name))
          modal.overlay.querySelector('#find-library-close')?.addEventListener('click', modal.close)
          return
        }

        modal = showModal(resultsModalHtml(track, playlist, matches))
        modal.overlay.querySelector('#find-library-close')?.addEventListener('click', modal.close)
        modal.overlay.querySelector('#find-library-open')?.addEventListener('click', () => {
          modal.close()
          onOpenPlaylist?.(playlistId)
        })
      } catch (e) {
        modal.close()
        const msg = spotifyErrorMessage(e)
        modal = showModal(`
          <div class="replace-modal find-library-modal" role="dialog">
            <h2 class="replace-modal-title">Could not check playlist</h2>
            <p class="replace-modal-body">${escapeHtml(msg)}</p>
            <div class="replace-modal-actions">
              <button type="button" class="btn-replace-cancel" id="find-library-close">OK</button>
            </div>
          </div>
        `)
        modal.overlay.querySelector('#find-library-close')?.addEventListener('click', modal.close)
      }
    })()
  }

  bindPicker(modal.overlay, modal.close, userId, others, currentPlaylistId, checkPlaylist)
}
