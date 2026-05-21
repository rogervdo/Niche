import { playPreview, stopPreview, unlockPreviewAudio } from './previewPlayer'
import { IMAGE_SIZES, renderImg } from '../spotify/images'
import { getPlaylistTrackEntries, spotifyErrorMessage, spotifyTrackOpenUrl } from '../spotify/api'
import { removePlaylistEntryAtPosition } from '../spotify/playlistEdit'
import {
  duplicateTrackIds,
  findDuplicateGroups,
  getVariantLabels,
  type DuplicateGroup,
} from '../spotify/trackDuplicates'
import { playlistDebug, playlistDebugError } from '../spotify/playlistDebug'
import { resolvePreviewUrl } from '../spotify/preview'
import type { PlaylistTrackEntry, SpotifyTrack } from '../spotify/types'

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

function popLabel(track: SpotifyTrack): string {
  const pop = track.popularity
  return pop != null ? String(pop) : '—'
}

function variantLabel(track: SpotifyTrack): string {
  return getVariantLabels(track).join(' · ')
}

function trackPreviewButton(track: SpotifyTrack): string {
  const art =
    renderImg({
      images: track.album.images,
      targetWidth: IMAGE_SIZES.track,
      width: 56,
      height: 56,
      alt: '',
      loading: 'eager',
      sizes: '56px',
    }) || '<span class="replace-thumb-placeholder">♪</span>'

  const previewAttr = track.preview_url
    ? ` data-preview-url="${escapeHtml(track.preview_url)}"`
    : ''

  return `
    <button
      type="button"
      class="replace-preview-btn"
      data-track-id="${track.id}"${previewAttr}
      title="Hover to preview"
      aria-label="Preview ${escapeHtml(track.name)}"
    >${art}</button>
  `
}

function bindModalPreviews(overlay: HTMLElement): void {
  let hoverToken = 0

  overlay.addEventListener('click', () => unlockPreviewAudio(), { once: true })

  overlay.querySelectorAll<HTMLButtonElement>('.replace-preview-btn').forEach((btn) => {
    btn.addEventListener('mouseenter', () => {
      void (async () => {
        const token = ++hoverToken
        const trackId = btn.dataset.trackId
        if (!trackId) return

        btn.classList.add('replace-preview-loading')
        btn.classList.remove('replace-preview-playing', 'replace-preview-unavailable')
        stopPreview()

        const previewUrl = await resolvePreviewUrl(
          trackId,
          btn.dataset.previewUrl ?? null
        )

        if (token !== hoverToken) return
        btn.classList.remove('replace-preview-loading')

        if (!previewUrl) {
          btn.classList.add('replace-preview-unavailable')
          return
        }

        btn.classList.add('replace-preview-playing')
        const ok = await playPreview(previewUrl)
        if (token !== hoverToken) return
        if (!ok) {
          btn.classList.remove('replace-preview-playing')
          btn.classList.add('replace-preview-unavailable')
        }
      })()
    })

    btn.addEventListener('mouseleave', () => {
      hoverToken += 1
      stopPreview()
      btn.classList.remove('replace-preview-loading', 'replace-preview-playing')
    })
  })
}

function showModalError(overlay: HTMLElement, message: string): void {
  const modal = overlay.querySelector('.replace-modal')
  if (!modal) return

  let err = modal.querySelector<HTMLElement>('.dup-modal-error')
  if (!err) {
    err = document.createElement('p')
    err.className = 'dup-modal-error'
    err.setAttribute('role', 'alert')
    const anchor =
      modal.querySelector('.replace-modal-preview-hint') ??
      modal.querySelector('.replace-modal-body')
    anchor?.insertAdjacentElement('afterend', err)
  }
  err.textContent = message
  err.hidden = false
}

function clearModalError(overlay: HTMLElement): void {
  overlay.querySelector<HTMLElement>('.dup-modal-error')?.remove()
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

function sameUriCountInGroup(group: DuplicateGroup, uri: string): number {
  return group.entries.filter((e) => e.uri === uri).length
}

function trackCompareRow(
  entry: PlaylistTrackEntry,
  group: DuplicateGroup,
  canEdit: boolean
): string {
  const track = entry.track
  const sharedUri = sameUriCountInGroup(group, entry.uri) > 1
  const sameIdCount = group.entries.filter((e) => e.track.id === track.id).length
  const distinction =
    sameIdCount > 1
      ? 'Same Spotify recording (duplicate row)'
      : sharedUri
        ? 'Same Spotify link as another row'
        : 'Different recording'

  return `
    <div class="replace-compare-track dup-compare-track">
      ${trackPreviewButton(track)}
      <div class="replace-compare-meta">
        <span class="replace-track-name">${escapeHtml(track.name)}</span>
        <span class="replace-track-album">${escapeHtml(track.album.name)} · ${formatDuration(track.duration_ms)}</span>
        <span class="replace-track-pop">${escapeHtml(variantLabel(track))} · Popularity ${popLabel(track)} · #${entry.position + 1} in playlist</span>
        <span class="replace-track-pop dup-entry-distinction">${escapeHtml(distinction)}</span>
      </div>
      <div class="dup-track-actions">
        <a
          class="dup-open-link"
          href="${spotifyTrackOpenUrl(track)}"
          target="_blank"
          rel="noreferrer"
        >Open</a>
        ${
          canEdit
            ? `
          <button
            type="button"
            class="btn-dup-remove"
            data-playlist-position="${entry.position}"
            data-track-id="${track.id}"
            aria-label="Remove ${escapeHtml(track.name)} from playlist at position ${entry.position + 1}"
          >Remove</button>
        `
            : ''
        }
      </div>
    </div>
  `
}

function groupSection(group: DuplicateGroup, index: number, canEdit: boolean): string {
  const title =
    group.normalizedTitle.charAt(0).toUpperCase() + group.normalizedTitle.slice(1)

  return `
    <section class="dup-group" aria-labelledby="dup-group-${index}">
      <span class="replace-compare-label" id="dup-group-${index}">
        ${escapeHtml(title)} · ${escapeHtml(group.artist)}
      </span>
      <p class="replace-modal-hint dup-group-hint">
        ${group.entries.length} versions in this playlist.${
          new Set(group.entries.map((e) => e.uri)).size < group.entries.length
            ? ' Some rows share the same Spotify link.'
            : ''
        }
      </p>
      <div class="dup-group-tracks">
        ${group.entries.map((e) => trackCompareRow(e, group, canEdit)).join('')}
      </div>
    </section>
  `
}

function resultsModalHtml(groups: DuplicateGroup[], canEdit: boolean): string {
  const totalTracks = groups.reduce((n, g) => n + g.entries.length, 0)

  return `
    <div class="replace-modal replace-modal-dupes" role="dialog" aria-labelledby="dup-modal-title">
      <h2 id="dup-modal-title" class="replace-modal-title">Duplicate songs</h2>
      <p class="replace-modal-body">
        Found ${groups.length} song${groups.length === 1 ? '' : 's'} with multiple versions
        (${totalTracks} tracks). Matches include remixes, deluxe, live, and remastered cuts.
      </p>
      <p class="replace-modal-preview-hint">Hover album art to preview</p>
      <div class="dup-groups">
        ${groups.map((g, i) => groupSection(g, i, canEdit)).join('')}
      </div>
      <div class="replace-modal-actions">
        <button type="button" class="btn-replace-cancel" id="dup-modal-close">Done</button>
      </div>
    </div>
  `
}

type ResultsModalState = {
  overlay: HTMLElement
  closeModal: () => void
  playlistId: string
  market: string
  canEdit: boolean
  entries: PlaylistTrackEntry[]
  renderMessage: (title: string, body: string, onClose?: () => void) => void
  onRemoveUpdate: (entries: PlaylistTrackEntry[], groups: DuplicateGroup[]) => void
  onError: (message: string) => void
}

function bindResultsModal(state: ResultsModalState): void {
  const { overlay, canEdit, playlistId, market } = state
  let entries = state.entries

  bindModalPreviews(overlay)
  overlay.querySelector('#dup-modal-close')?.addEventListener('click', () => state.closeModal())

  if (!canEdit) return

  overlay.querySelectorAll<HTMLButtonElement>('.btn-dup-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      void (async () => {
        const position = Number(btn.dataset.playlistPosition)
        const trackId = btn.dataset.trackId
        const row = btn.closest('.dup-compare-track')
        const rowName = row?.querySelector('.replace-track-name')?.textContent ?? '?'

        if (Number.isNaN(position)) {
          playlistDebug('dup modal: Remove clicked but position missing', {
            dataset: { ...btn.dataset },
            rowName,
          })
          return
        }

        playlistDebug('dup modal: Remove clicked', {
          playlistId,
          playlistPosition: position,
          displayNumber: position + 1,
          rowName,
        })

        btn.disabled = true
        btn.textContent = 'Removing…'
        clearModalError(overlay)

        try {
          const countBefore = entries.length
          const idCopiesBefore = trackId
            ? entries.filter((e) => e.track.id === trackId).length
            : entries.filter((e) => e.track.name === rowName).length

          const freshEntries = await removePlaylistEntryAtPosition(
            playlistId,
            position,
            market
          )

          const otherPositions = freshEntries
            .filter((e) =>
              trackId ? e.track.id === trackId : e.track.name === rowName
            )
            .map((e) => e.position + 1)

          playlistDebug('dup modal: refresh after remove', {
            playableCount: freshEntries.length,
            countBefore,
            removedPosition: position,
            idCopiesBefore,
            idCopiesAfter: trackId
              ? freshEntries.filter((e) => e.track.id === trackId).length
              : freshEntries.filter((e) => e.track.name === rowName).length,
            otherPositions: otherPositions.length ? otherPositions : null,
          })

          if (freshEntries.length >= countBefore) {
            const where =
              otherPositions.length > 0
                ? ` It is still at #${otherPositions.join(', #')}.`
                : ''
            throw new Error(
              `“${rowName}” is still in the playlist.${where} Try removing again.`
            )
          }

          if (
            idCopiesBefore <= 1 &&
            (trackId
              ? freshEntries.some((e) => e.track.id === trackId)
              : freshEntries.some((e) => e.track.name === rowName))
          ) {
            const where =
              otherPositions.length > 0
                ? ` It is still at #${otherPositions.join(', #')}.`
                : ''
            throw new Error(
              `“${rowName}” is still in the playlist.${where} Try removing again.`
            )
          }

          entries = freshEntries
          const groups = findDuplicateGroups(entries)
          state.onRemoveUpdate(entries, groups)

          if (!groups.length) {
            state.closeModal()
            state.renderMessage(
              'No duplicates left',
              'All duplicate versions have been resolved.'
            )
            return
          }

          const modal = overlay.querySelector('.replace-modal')
          if (modal) {
            modal.outerHTML = resultsModalHtml(groups, canEdit)
            bindResultsModal({ ...state, entries })
          }
        } catch (e) {
          playlistDebugError('dup modal: Remove failed', e, {
            playlistPosition: position,
            rowName,
          })
          btn.disabled = false
          btn.textContent = 'Remove'
          const msg = spotifyErrorMessage(e)
          showModalError(overlay, msg)
          state.onError(msg)
        }
      })()
    })
  })
}

function openResultsModal(
  groups: DuplicateGroup[],
  state: Omit<ResultsModalState, 'overlay' | 'closeModal'> & {
    closeModalRef: { current: () => void }
  }
): void {
  state.closeModalRef.current()
  const modal = showModal(resultsModalHtml(groups, state.canEdit))
  state.closeModalRef.current = modal.close

  bindResultsModal({
    overlay: modal.overlay,
    closeModal: modal.close,
    playlistId: state.playlistId,
    market: state.market,
    canEdit: state.canEdit,
    entries: state.entries,
    renderMessage: state.renderMessage,
    onRemoveUpdate: state.onRemoveUpdate,
    onError: state.onError,
  })
}

export function runDuplicateDetectFlow(opts: {
  playlistId: string
  market: string
  canEdit: boolean
  onFound: (groups: DuplicateGroup[], highlightedIds: Set<string>) => void
  onNone: () => void
  onRemoveUpdate: (entries: PlaylistTrackEntry[], groups: DuplicateGroup[]) => void
  onError: (message: string) => void
}): void {
  const { playlistId, market, canEdit, onFound, onNone, onRemoveUpdate, onError } = opts

  const closeModalRef = { current: () => {} }

  const renderMessage = (title: string, body: string, onClose?: () => void) => {
    closeModalRef.current()
    const modal = showModal(`
      <div class="replace-modal" role="dialog" aria-labelledby="dup-modal-title">
        <h2 id="dup-modal-title" class="replace-modal-title">${escapeHtml(title)}</h2>
        <p class="replace-modal-body">${escapeHtml(body)}</p>
        <div class="replace-modal-actions">
          <button type="button" class="btn-replace-cancel" id="dup-modal-close">OK</button>
        </div>
      </div>
    `)
    closeModalRef.current = modal.close
    modal.overlay.querySelector('#dup-modal-close')?.addEventListener('click', () => {
      closeModalRef.current()
      onClose?.()
    })
  }

  closeModalRef.current = showModal(`
    <div class="replace-modal" role="dialog" aria-labelledby="dup-modal-title">
      <h2 id="dup-modal-title" class="replace-modal-title">Detect duplicates</h2>
      <p class="replace-modal-body">Scanning playlist for remixes, deluxe, live, and remastered versions…</p>
    </div>
  `).close

  window.setTimeout(() => {
    void (async () => {
      let entries: PlaylistTrackEntry[]
      try {
        entries = await getPlaylistTrackEntries(playlistId, market)
      } catch (e) {
        closeModalRef.current()
        onError(spotifyErrorMessage(e))
        return
      }

      const groups = findDuplicateGroups(entries)

      if (!groups.length) {
        closeModalRef.current()
        onNone()
        renderMessage(
          'No duplicates found',
          'This playlist has no songs appearing more than once under different cuts (remix, deluxe, live, remastered, etc.).'
        )
        return
      }

      onFound(groups, duplicateTrackIds(groups))

      openResultsModal(groups, {
        closeModalRef,
        playlistId,
        market,
        canEdit,
        entries,
        renderMessage,
        onRemoveUpdate,
        onError,
      })
    })()
  }, 0)
}
