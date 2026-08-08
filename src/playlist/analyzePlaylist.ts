import { stopPreview } from './previewPlayer'
import { batchGetArtists } from '../spotify/artists'
import { spotifyErrorMessage } from '../spotify/api'
import type { PlaylistTrackEntry } from '../spotify/types'

const TOP_GENRE_LIMIT = 6
const TOP_ARTIST_LIMIT = 3

export type RankedGenre = {
  rank: number
  name: string
  score: number
}

export type PlaylistArtistStat = {
  name: string
  count: number
}

export type PlaylistAnalysis = {
  trackCount: number
  tracksWithPopularity: number
  avgPopularity: number | null
  nicheRating: number | null
  genres: RankedGenre[]
  topArtists: PlaylistArtistStat[]
}

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

function titleCaseGenre(genre: string): string {
  return genre.replace(/\b\w/g, (c) => c.toUpperCase())
}

function topArtistsInEntries(
  entries: PlaylistTrackEntry[],
  limit: number
): PlaylistArtistStat[] {
  const counts = new Map<string, number>()
  for (const e of entries) {
    for (const a of e.track.artists) {
      counts.set(a.name, (counts.get(a.name) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

function aggregateGenres(
  entries: PlaylistTrackEntry[],
  artistsById: Map<string, { genres: string[] }>
): RankedGenre[] {
  const scores = new Map<string, number>()
  for (const entry of entries) {
    const trackArtists = entry.track.artists
    const weight = trackArtists.length ? 1 / trackArtists.length : 1
    for (const artist of trackArtists) {
      if (!artist.id) continue
      const full = artistsById.get(artist.id)
      if (!full?.genres.length) continue
      for (const genre of full.genres) {
        scores.set(genre, (scores.get(genre) ?? 0) + weight)
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_GENRE_LIMIT)
    .map(([name, score], index) => ({
      rank: index + 1,
      name: titleCaseGenre(name),
      score: Math.round(score * 10) / 10,
    }))
}

function nicheRatingFromPopularity(avgPopularity: number): number {
  return Math.max(1, Math.min(100, Math.round(100 - avgPopularity)))
}

export async function analyzePlaylist(
  entries: PlaylistTrackEntry[]
): Promise<PlaylistAnalysis> {
  const trackCount = entries.length
  const popularities = entries
    .map((e) => e.track.popularity)
    .filter((p): p is number => p != null)
  const avgPopularity = popularities.length
    ? popularities.reduce((a, b) => a + b, 0) / popularities.length
    : null
  const nicheRating =
    avgPopularity != null ? nicheRatingFromPopularity(avgPopularity) : null

  const artistIds = [
    ...new Set(
      entries.flatMap((e) => e.track.artists.map((a) => a.id).filter(Boolean))
    ),
  ] as string[]

  const artists = artistIds.length ? await batchGetArtists(artistIds) : []
  const artistsById = new Map(artists.map((a) => [a.id, a]))

  return {
    trackCount,
    tracksWithPopularity: popularities.length,
    avgPopularity:
      avgPopularity != null ? Math.round(avgPopularity * 10) / 10 : null,
    nicheRating,
    genres: aggregateGenres(entries, artistsById),
    topArtists: topArtistsInEntries(entries, TOP_ARTIST_LIMIT),
  }
}

function genreBarListHtml(genres: RankedGenre[]): string {
  if (!genres.length) {
    return '<p class="analyzer-empty">No genre tags found for artists in this playlist.</p>'
  }
  const maxScore = Math.max(...genres.map((g) => g.score), 1)
  const rows = genres
    .map((genre) => {
      const pct = Math.max(4, Math.round((genre.score / maxScore) * 100))
      return `
      <li class="genre-bar-row">
        <span class="genre-bar-rank">${genre.rank}.</span>
        <div class="genre-bar-main">
          <span class="genre-bar-name">${escapeHtml(genre.name)}</span>
          <div class="genre-bar-track" role="presentation" aria-hidden="true">
            <div class="genre-bar-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      </li>
    `
    })
    .join('')
  return `<ol class="genre-bar-list">${rows}</ol>`
}

function topArtistsHtml(artists: PlaylistArtistStat[], trackCount: number): string {
  if (!artists.length) {
    return '<p class="analyzer-empty">No artist credits on these tracks.</p>'
  }
  const rows = artists
    .map(
      (artist, index) => `
    <li class="analyzer-artist-row">
      <span class="analyzer-artist-rank">${index + 1}</span>
      <div class="analyzer-artist-meta">
        <span class="analyzer-artist-name">${escapeHtml(artist.name)}</span>
        <span class="analyzer-artist-count">${artist.count} track${artist.count === 1 ? '' : 's'} · ${Math.round((artist.count / trackCount) * 100)}%</span>
      </div>
    </li>
  `
    )
    .join('')
  return `<ol class="analyzer-artist-list">${rows}</ol>`
}

function statsBoardHtml(playlistName: string, analysis: PlaylistAnalysis): string {
  const nicheBlock =
    analysis.nicheRating != null
      ? `
    <div class="analyzer-hero">
      <p class="analyzer-hero-label">Niche rating</p>
      <p class="analyzer-niche-score" aria-label="Niche rating ${analysis.nicheRating} out of 100">${analysis.nicheRating}<span class="analyzer-niche-max">/100</span></p>
      <p class="analyzer-hero-hint">Higher means deeper cuts — based on average track popularity (Spotify 0–100, inverted).</p>
      ${
        analysis.avgPopularity != null
          ? `<p class="analyzer-hero-sub">Avg. popularity ${analysis.avgPopularity} across ${analysis.tracksWithPopularity} of ${analysis.trackCount} tracks.</p>`
          : ''
      }
    </div>
  `
      : `
    <div class="analyzer-hero">
      <p class="analyzer-hero-label">Niche rating</p>
      <p class="analyzer-empty">Popularity data isn’t available for these tracks yet.</p>
    </div>
  `

  return `
    <div class="replace-modal analyzer-modal" role="dialog" aria-labelledby="analyzer-modal-title">
      <h2 id="analyzer-modal-title" class="replace-modal-title">Playlist analyzer</h2>
      <p class="replace-modal-hint">${escapeHtml(playlistName)} · ${analysis.trackCount} track${analysis.trackCount === 1 ? '' : 's'}</p>
      <div class="analyzer-board">
        ${nicheBlock}
        <section class="analyzer-section" aria-labelledby="analyzer-genres-heading">
          <h3 class="analyzer-section-title" id="analyzer-genres-heading">Top genres</h3>
          ${genreBarListHtml(analysis.genres)}
        </section>
        <section class="analyzer-section" aria-labelledby="analyzer-artists-heading">
          <h3 class="analyzer-section-title" id="analyzer-artists-heading">Top artists</h3>
          ${topArtistsHtml(analysis.topArtists, analysis.trackCount)}
        </section>
      </div>
      <div class="replace-modal-actions">
        <button type="button" class="btn-replace-cancel" id="analyzer-modal-close">Close</button>
      </div>
    </div>
  `
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

export function runPlaylistAnalyzeFlow(opts: {
  playlistName: string
  entries: PlaylistTrackEntry[]
  onError: (message: string) => void
}): void {
  const { playlistName, entries, onError } = opts

  if (!entries.length) {
    onError('This playlist has no tracks to analyze.')
    return
  }

  const closeModalRef = { current: () => {} }

  closeModalRef.current = showModal(`
    <div class="replace-modal analyzer-modal" role="dialog" aria-labelledby="analyzer-modal-title">
      <h2 id="analyzer-modal-title" class="replace-modal-title">Playlist analyzer</h2>
      <p class="replace-modal-body">Analyzing ${entries.length} track${entries.length === 1 ? '' : 's'}…</p>
    </div>
  `).close

  void (async () => {
    try {
      const analysis = await analyzePlaylist(entries)
      closeModalRef.current()
      const modal = showModal(statsBoardHtml(playlistName, analysis))
      closeModalRef.current = modal.close
      modal.overlay
        .querySelector('#analyzer-modal-close')
        ?.addEventListener('click', () => closeModalRef.current())
    } catch (err) {
      closeModalRef.current()
      onError(spotifyErrorMessage(err))
    }
  })()
}
