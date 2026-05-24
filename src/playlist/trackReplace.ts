import { playPreview, stopPreview, unlockPreviewAudio } from './previewPlayer'
import { IMAGE_SIZES, renderImg } from '../spotify/images'
import { spotifyErrorMessage } from '../spotify/api'
import { playlistDebug } from '../spotify/playlistDebug'
import { lookupBetterVersion, replaceTrackAtPosition } from '../spotify/playlistEdit'
import { resolvePreviewUrl } from '../spotify/preview'
import type { SpotifyTrack } from '../spotify/types'

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
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

function bindReplaceModalPreviews(overlay: HTMLElement): void {
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
        const ok = await playPreview(previewUrl, {
          isCancelled: () => token !== hoverToken,
        })
        if (token !== hoverToken) {
          stopPreview()
          return
        }
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

function popLabel(track: SpotifyTrack): string {
  const pop = track.popularity
  return pop != null ? String(pop) : '—'
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

export async function runTrackReplaceFlow(opts: {
  playlistId: string
  track: SpotifyTrack
  /** 0-based index in the full Spotify playlist (includes unavailable rows). */
  playlistPosition: number
  market: string
  /** When false (e.g. followed playlists), search only — open the match in Spotify instead of editing the playlist. */
  allowPlaylistReplace?: boolean
  onSuccess: (newTrack: SpotifyTrack) => void
  onError: (message: string) => void
}): Promise<void> {
  const {
    playlistId,
    track,
    playlistPosition,
    market,
    allowPlaylistReplace = true,
    onSuccess,
    onError,
  } = opts

  let closeModal = () => {}

  const renderMessage = (title: string, body: string) => {
    closeModal()
    const modal = showModal(`
      <div class="replace-modal" role="dialog" aria-labelledby="replace-modal-title">
        <h2 id="replace-modal-title" class="replace-modal-title">${escapeHtml(title)}</h2>
        <p class="replace-modal-body">${escapeHtml(body)}</p>
        <div class="replace-modal-actions">
          <button type="button" class="btn-replace-cancel" id="replace-close">OK</button>
        </div>
      </div>
    `)
    closeModal = modal.close
    modal.overlay
      .querySelector('#replace-close')
      ?.addEventListener('click', () => closeModal())
  }

  closeModal = showModal(`
    <div class="replace-modal" role="dialog" aria-labelledby="replace-modal-title">
      <h2 id="replace-modal-title" class="replace-modal-title">${
        allowPlaylistReplace ? 'Search & replace' : 'Find popular version'
      }</h2>
      <p class="replace-modal-body">Searching for a more popular version…</p>
    </div>
  `).close

  let lookup
  try {
    lookup = await lookupBetterVersion(track, market)
  } catch (e) {
    closeModal()
    onError(spotifyErrorMessage(e))
    return
  }

  if (lookup.status === 'same') {
    closeModal()
    renderMessage(
      'Already the top version',
      'This track already has the highest popularity among matching recordings.'
    )
    return
  }

  if (lookup.status === 'none') {
    closeModal()
    renderMessage(
      'No better match found',
      'Could not find another recording by the same artist with a higher popularity score.'
    )
    return
  }

  if (lookup.status === 'insufficient_gain') {
    closeModal()
    renderMessage(
      'No meaningful upgrade',
      `The best match is not enough of an upgrade over the current version (need a stronger improvement).`
    )
    return
  }

  const candidate = lookup.candidate
  closeModal()

  const spotifyUrl = candidate.external_urls.spotify
  const confirmModal = showModal(`
    <div class="replace-modal replace-modal-confirm" role="dialog" aria-labelledby="replace-modal-title">
      <h2 id="replace-modal-title" class="replace-modal-title">${
        allowPlaylistReplace
          ? 'Replace with popular version?'
          : 'More popular version found'
      }</h2>
      <p class="replace-modal-preview-hint">Hover album art to preview</p>
      <div class="replace-compare">
        <div class="replace-compare-col">
          <span class="replace-compare-label">Current</span>
          <div class="replace-compare-track">
            ${trackPreviewButton(track)}
            <div class="replace-compare-meta">
              <span class="replace-track-name">${escapeHtml(track.name)}</span>
              <span class="replace-track-album">${escapeHtml(track.album.name)}</span>
              <span class="replace-track-pop">Popularity ${popLabel(track)}</span>
            </div>
          </div>
        </div>
        <span class="replace-arrow" aria-hidden="true">→</span>
        <div class="replace-compare-col">
          <span class="replace-compare-label">Suggested</span>
          <div class="replace-compare-track">
            ${trackPreviewButton(candidate)}
            <div class="replace-compare-meta">
              <span class="replace-track-name">${escapeHtml(candidate.name)}</span>
              <span class="replace-track-album">${escapeHtml(candidate.album.name)}</span>
              <span class="replace-track-pop">Popularity ${popLabel(candidate)}</span>
            </div>
          </div>
        </div>
      </div>
      <p class="replace-modal-hint">${
        allowPlaylistReplace
          ? 'Replaces this track in the playlist at the same position.'
          : 'Followed playlists are read-only — open the suggested track in Spotify.'
      }</p>
      <div class="replace-modal-actions">
        <button type="button" class="btn-replace-cancel" id="replace-cancel">Cancel</button>
        ${
          allowPlaylistReplace
            ? '<button type="button" class="btn-replace-confirm" id="replace-confirm">Replace</button>'
            : `<a class="btn-replace-confirm btn-open-spotify" id="replace-open-spotify" href="${escapeHtml(spotifyUrl)}" target="_blank" rel="noreferrer">Open in Spotify</a>`
        }
      </div>
    </div>
  `)
  closeModal = confirmModal.close
  bindReplaceModalPreviews(confirmModal.overlay)

  const cancelBtn = confirmModal.overlay.querySelector<HTMLButtonElement>('#replace-cancel')

  cancelBtn?.addEventListener('click', () => closeModal())

  if (!allowPlaylistReplace) {
    confirmModal.overlay
      .querySelector('#replace-open-spotify')
      ?.addEventListener('click', () => closeModal())
    return
  }

  const confirmBtn = confirmModal.overlay.querySelector<HTMLButtonElement>('#replace-confirm')

  confirmBtn?.addEventListener('click', () => {
    void (async () => {
      confirmBtn.disabled = true
      cancelBtn?.setAttribute('disabled', 'true')
      confirmBtn.textContent = 'Replacing…'

      try {
        playlistDebug('replace modal: confirming', {
          playlistId,
          playlistPosition,
          from: track.name,
          to: candidate.name,
        })
        await replaceTrackAtPosition(
          playlistId,
          playlistPosition,
          track.id,
          candidate.id,
          market
        )
        closeModal()
        onSuccess(candidate)
      } catch (e) {
        closeModal()
        onError(spotifyErrorMessage(e))
      }
    })()
  })
}
