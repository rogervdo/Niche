import {
  fetchTopItems,
  TIME_RANGE_LABELS,
  type RankedArtist,
  type RankedGenre,
  type RankedTrack,
  type TimeRange,
  type TopCategory,
} from './statsApi'
import { stopPreview } from '../playlist/previewPlayer'
import {
  bindListeningBrowse,
  listeningBrowseSectionHtml,
  loadBrowsePrefs,
  TOP_ARTIST_SORT_OPTIONS,
  TOP_GENRE_SORT_OPTIONS,
  TOP_TRACK_SORT_OPTIONS,
  type BrowsePrefs,
  type SortOption,
} from './browseUi'
import { artistItem, genreItem, trackItemFromRanked, type ListeningItem } from './items'
import {
  escapeHtml,
  iconHash,
  iconMusicNote,
  iconPerson,
} from './shared'

const CATEGORY_STORAGE_KEY = 'niche_top_category'
const RANGE_STORAGE_KEY = 'niche_top_range'
const STORAGE_PREFIX = 'niche_top'

const CATEGORIES: { id: TopCategory; label: string; icon: (n?: number) => string }[] = [
  { id: 'tracks', label: 'Tracks', icon: iconMusicNote },
  { id: 'artists', label: 'Artists', icon: iconPerson },
  { id: 'genres', label: 'Genres', icon: iconHash },
]

const RANGES: TimeRange[] = ['short_term', 'medium_term', 'long_term']

let activeSession: TopViewSession | null = null

function loadCategory(): TopCategory {
  const v = localStorage.getItem(CATEGORY_STORAGE_KEY)
  return v === 'artists' || v === 'genres' ? v : 'tracks'
}

function loadRange(): TimeRange {
  const v = localStorage.getItem(RANGE_STORAGE_KEY)
  return v === 'medium_term' || v === 'long_term' ? v : 'short_term'
}

function titleForCategory(category: TopCategory): string {
  switch (category) {
    case 'tracks':
      return 'Top Tracks'
    case 'artists':
      return 'Top Artists'
    case 'genres':
      return 'Top Genres'
  }
}

function sortOptionsFor(category: TopCategory): SortOption[] {
  switch (category) {
    case 'tracks':
      return TOP_TRACK_SORT_OPTIONS
    case 'artists':
      return TOP_ARTIST_SORT_OPTIONS
    case 'genres':
      return TOP_GENRE_SORT_OPTIONS
  }
}

function toListeningItems(
  category: TopCategory,
  items: RankedTrack[] | RankedArtist[] | RankedGenre[]
): ListeningItem[] {
  if (category === 'tracks') {
    return (items as RankedTrack[])
      .map(trackItemFromRanked)
      .filter((item): item is ListeningItem => item != null)
  }
  if (category === 'artists') {
    return (items as RankedArtist[]).map(artistItem)
  }
  return (items as RankedGenre[]).map(genreItem)
}

class TopViewSession {
  private loadGeneration = 0
  private category: TopCategory
  private range: TimeRange
  private loading = true
  private error: string | null = null
  private items: RankedTrack[] | RankedArtist[] | RankedGenre[] = []
  private prefs: BrowsePrefs
  private readonly root: HTMLElement
  private readonly onBack: () => void

  private readonly onRootClick = (e: Event): void => {
    if (activeSession !== this) return

    const target = e.target
    if (!(target instanceof Element)) return

    const catBtn = target.closest<HTMLButtonElement>('[data-top-category]')
    if (catBtn) {
      e.preventDefault()
      const next = catBtn.dataset.topCategory as TopCategory | undefined
      if (!next) return
      const changed = next !== this.category
      if (changed) {
        this.category = next
        localStorage.setItem(CATEGORY_STORAGE_KEY, this.category)
        this.prefs = { ...this.prefs, sortMode: 'rank', selectedId: null }
        this.items = []
      }
      void this.load()
      return
    }

    const rangeBtn = target.closest<HTMLButtonElement>('[data-top-range]')
    if (rangeBtn) {
      e.preventDefault()
      const next = rangeBtn.dataset.topRange as TimeRange | undefined
      if (!next) return
      if (next !== this.range) {
        this.range = next
        localStorage.setItem(RANGE_STORAGE_KEY, this.range)
      }
      void this.load()
    }
  }

  constructor(root: HTMLElement, onBack: () => void) {
    this.root = root
    this.onBack = onBack
    this.category = loadCategory()
    this.range = loadRange()
    this.prefs = loadBrowsePrefs(STORAGE_PREFIX, 'rank')
    activeSession = this
    this.root.addEventListener('click', this.onRootClick)
  }

  dispose(): void {
    this.loadGeneration += 1
    stopPreview()
    const browse = this.root.querySelector('.listening-browse')
    if (browse instanceof HTMLElement) {
      ;(browse as HTMLElement & { __listeningPreviewCleanup?: () => void }).__listeningPreviewCleanup?.()
    }
    this.root.removeEventListener('click', this.onRootClick)
    if (activeSession === this) activeSession = null
  }

  private listeningItems(): ListeningItem[] {
    return toListeningItems(this.category, this.items)
  }

  private paint(): void {
    if (activeSession !== this) return

    const list =
      this.loading || this.error ? [] : this.listeningItems()
    const sortOptions = sortOptionsFor(this.category)
    const searchPlaceholder =
      this.category === 'tracks'
        ? 'Search top tracks…'
        : this.category === 'artists'
          ? 'Search top artists…'
          : 'Search top genres…'

    const genreBar = this.category === 'genres'
    const browseBlock =
      !this.loading && !this.error && list.length
        ? listeningBrowseSectionHtml(
            this.prefs,
            sortOptions,
            list,
            searchPlaceholder,
            'No data for this time range yet.',
            genreBar
          )
        : ''

    const shellWideClass = !genreBar ? 'listening-page-wide' : ''

    this.root.innerHTML = `
      <div class="shell stats-shell listening-page-shell ${shellWideClass}" data-top-view>
        <button type="button" class="btn-back" id="top-back">← Back to playlists</button>

        <header class="stats-header">
          <h1 class="stats-title">${titleForCategory(this.category)}</h1>
        </header>

        <div class="stats-toggle-panel">
          <div class="stats-toggle-row" role="tablist" aria-label="Category">
            ${CATEGORIES.map(
              (c) => `
              <button
                type="button"
                class="stats-toggle-btn ${this.category === c.id ? 'active' : ''}"
                data-top-category="${c.id}"
                role="tab"
                aria-selected="${this.category === c.id}"
              >${c.icon()} ${c.label}</button>
            `
            ).join('')}
          </div>
          <div class="stats-toggle-row" role="tablist" aria-label="Time range">
            ${RANGES.map(
              (r) => `
              <button
                type="button"
                class="stats-toggle-btn ${this.range === r ? 'active' : ''}"
                data-top-range="${r}"
                role="tab"
                aria-selected="${this.range === r}"
              >${TIME_RANGE_LABELS[r]}</button>
            `
            ).join('')}
          </div>
        </div>

        <div class="listening-page-body">
          ${
            this.loading
              ? '<div class="stats-loading"><div class="spinner"></div><p>Loading…</p></div>'
              : this.error
                ? `<p class="stats-error">${escapeHtml(this.error)}</p>`
                : browseBlock ||
                  '<p class="stats-empty">No data for this time range yet.</p>'
          }
        </div>
      </div>
    `

    this.root.querySelector('#top-back')?.addEventListener('click', () => {
      this.dispose()
      this.onBack()
    })

    if (!browseBlock) return

    const browseRoot = this.root.querySelector('.listening-browse')
    if (!browseRoot || !(browseRoot instanceof HTMLElement)) return

    bindListeningBrowse({
      root: browseRoot,
      storagePrefix: STORAGE_PREFIX,
      prefs: this.prefs,
      sortOptions,
      allItems: list,
      emptyMessage: 'No matches.',
      genreBarMode: genreBar,
      onChange: (next: BrowsePrefs) => {
        this.prefs = next
        const shell = this.root.querySelector('.listening-page-shell')
        shell?.classList.toggle('listening-page-wide', this.category !== 'genres')
      },
    })
  }

  async load(): Promise<void> {
    const gen = ++this.loadGeneration
    this.loading = true
    this.error = null
    this.paint()
    try {
      const data = await fetchTopItems(this.category, this.range)
      if (gen !== this.loadGeneration || activeSession !== this) return
      this.items = data
    } catch (e) {
      if (gen !== this.loadGeneration || activeSession !== this) return
      this.error = e instanceof Error ? e.message : 'Failed to load top items'
      this.items = []
    } finally {
      if (gen !== this.loadGeneration || activeSession !== this) return
      this.loading = false
      this.paint()
    }
  }

  async run(): Promise<void> {
    await this.load()
  }
}

export async function renderTopView(
  root: HTMLElement,
  onBack: () => void
): Promise<void> {
  activeSession?.dispose()
  const session = new TopViewSession(root, onBack)
  await session.run()
}

export function disposeTopView(): void {
  activeSession?.dispose()
}
