import { stopPreview } from './previewPlayer'
import { spotifyErrorMessage } from '../spotify/api'
import type { PlaylistTrackEntry, SpotifyTrack } from '../spotify/types'
import type { PlaylistRef } from './trackPlaylistIndex'

type Member = { track: SpotifyTrack; playlists: PlaylistRef[] }

export type LikedSongsMembership = {
  total: number
  orphanCount: number
  memberCount: number
  orphans: SpotifyTrack[]
  members: Member[]
}

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

function artistLabel(track: SpotifyTrack): string {
  return track.artists.map((a) => a.name).join(', ')
}

function trackNameKey(track: SpotifyTrack): string {
  return track.name.toLocaleLowerCase()
}

function byNameThenArtist(a: SpotifyTrack, b: SpotifyTrack): number {
  return (
    trackNameKey(a).localeCompare(trackNameKey(b), undefined, { sensitivity: 'base' }) ||
    artistLabel(a).localeCompare(artistLabel(b), undefined, { sensitivity: 'base' })
  )
}

function analyzeMembership(
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

function showModal(html: string): { close: () => void; overlay: HTMLElement } {
  const overlay = document.createElement('div')
  overlay.className = 'replace-modal-overlay'
  overlay.innerHTML = html
  document.body.appendChild(overlay)

  const close = () => {
    stopPreview()
    overlay.remove()
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  return { close, overlay }
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

function resultsHtml(result: LikedSongsMembership): string {
  const plural = (n: number) => (n === 1 ? '' : 's')

  const orphanRows = result.orphans
    .map((t) => trackRowHtml(t, null))
    .join('')
  const memberRows = result.members
    .map((m) => trackRowHtml(m.track, m.playlists))
    .join('')

  return `
    <div class="replace-modal analyze-liked-modal" role="dialog" aria-labelledby="analyze-liked-title">
      <h2 id="analyze-liked-title" class="replace-modal-title">Liked songs in your playlists</h2>
      <p class="replace-modal-hint">
        ${result.total} liked song${plural(result.total)} · ${result.orphanCount} not in any playlist · ${result.memberCount} in at least one.
      </p>
      <div class="analyze-liked-board">
        <section class="analyzer-section" aria-labelledby="analyze-liked-orphans-heading">
          <h3 class="analyzer-section-title" id="analyze-liked-orphans-heading">
            Not in any playlist (${result.orphanCount})
          </h3>
          ${
            orphanRows
              ? `<ul class="analyze-liked-list">${orphanRows}</ul>`
              : '<p class="analyzer-empty">Every liked song is in at least one of your playlists.</p>'
          }
        </section>
        <section class="analyzer-section" aria-labelledby="analyze-liked-members-heading">
          <h3 class="analyzer-section-title" id="analyze-liked-members-heading">
            In your playlists (${result.memberCount})
          </h3>
          ${
            memberRows
              ? `<ul class="analyze-liked-list">${memberRows}</ul>`
              : '<p class="analyzer-empty">None of your liked songs are in any of your playlists.</p>'
          }
        </section>
      </div>
      <div class="replace-modal-actions">
        <button type="button" class="btn-replace-cancel" id="analyze-liked-close">Done</button>
      </div>
    </div>
  `
}

export function runLikedSongsAnalysisFlow(opts: {
  entries: PlaylistTrackEntry[]
  loadIndex: () => Promise<Map<string, PlaylistRef[]>>
  isPlaylistArchived?: (playlistId: string) => boolean
  onOpenPlaylist?: (playlistId: string) => void
  onError: (message: string) => void
}): void {
  const { entries, loadIndex, isPlaylistArchived, onOpenPlaylist, onError } = opts

  if (!entries.length) {
    onError('No liked songs to analyze.')
    return
  }

  const closeModalRef = { current: () => {} }

  closeModalRef.current = showModal(`
    <div class="replace-modal analyze-liked-modal" role="dialog" aria-labelledby="analyze-liked-title">
      <h2 id="analyze-liked-title" class="replace-modal-title">Analyzing liked songs</h2>
      <p class="replace-modal-body">Checking which of your playlists contain each liked song…</p>
    </div>
  `).close

  void (async () => {
    try {
      const index = await loadIndex()
      const result = analyzeMembership(entries, index, isPlaylistArchived)

      closeModalRef.current()
      const modal = showModal(resultsHtml(result))
      closeModalRef.current = modal.close

      modal.overlay
        .querySelector('#analyze-liked-close')
        ?.addEventListener('click', () => closeModalRef.current())

      modal.overlay
        .querySelectorAll<HTMLButtonElement>('.track-playlist-tag')
        .forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.openPlaylist
            if (!id) return
            closeModalRef.current()
            onOpenPlaylist?.(id)
          })
        })
    } catch (err) {
      closeModalRef.current()
      onError(spotifyErrorMessage(err))
    }
  })()
}
