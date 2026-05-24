import { stopPreview } from '../playlist/previewPlayer'
import { isInsufficientScopeMessage } from '../spotify/auth'
import {
  bindListeningBrowse,
  listeningBrowseSectionHtml,
  loadBrowsePrefs,
  RECENT_SORT_OPTIONS,
  type BrowsePrefs,
} from './browseUi'
import { trackItemFromRecent } from './items'
import { fetchRecentlyPlayed } from './statsApi'
import { escapeHtml } from './shared'

const STORAGE_PREFIX = 'niche_recent'

export async function renderRecentView(
  root: HTMLElement,
  onBack: () => void,
  onReconnect: () => void
): Promise<void> {
  let loading = true
  let error: string | null = null
  let needsScope = false
  let prefs = loadBrowsePrefs(STORAGE_PREFIX, 'played_newest')

  async function load(): Promise<void> {
    loading = true
    error = null
    needsScope = false
    paintShell([])
    try {
      const raw = await fetchRecentlyPlayed()
      loading = false
      paintShell(raw.map(trackItemFromRecent))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load recently played'
      needsScope = isInsufficientScopeMessage(msg)
      error = msg
      loading = false
      paintShell([])
    }
  }

  function paintShell(items: ReturnType<typeof trackItemFromRecent>[]): void {
    const browseBlock =
      !loading && !error && items.length
        ? listeningBrowseSectionHtml(
            prefs,
            RECENT_SORT_OPTIONS,
            items,
            'Search recently played…',
            'Nothing played recently.'
          )
        : ''

    root.innerHTML = `
      <div class="shell stats-shell listening-page-shell listening-page-wide">
        <button type="button" class="btn-back" id="recent-back">← Back to playlists</button>

        <header class="stats-header">
          <h1 class="stats-title">Recently Played</h1>
        </header>

        <div class="listening-page-body">
          ${
            loading
              ? '<div class="stats-loading"><div class="spinner"></div><p>Loading…</p></div>'
              : error
                ? `<div class="stats-error-block">
                    <p class="stats-error">${escapeHtml(error)}</p>
                    ${
                      needsScope
                        ? '<button type="button" class="btn-spotify" id="recent-reconnect">Reconnect Spotify</button>'
                        : '<button type="button" class="btn-ghost" id="recent-retry">Try again</button>'
                    }
                  </div>`
                : browseBlock ||
                  '<p class="stats-empty">Nothing played recently.</p>'
          }
        </div>
      </div>
    `

    root.querySelector('#recent-back')?.addEventListener('click', () => {
      stopPreview()
      const browse = root.querySelector('.listening-browse')
      if (browse instanceof HTMLElement) {
        ;(browse as HTMLElement & { __listeningPreviewCleanup?: () => void }).__listeningPreviewCleanup?.()
      }
      onBack()
    })
    root.querySelector('#recent-retry')?.addEventListener('click', () => void load())
    root.querySelector('#recent-reconnect')?.addEventListener('click', onReconnect)

    if (!browseBlock) return

    const browseRoot = root.querySelector('.listening-browse')
    if (!browseRoot || !(browseRoot instanceof HTMLElement)) return

    bindListeningBrowse({
      root: browseRoot,
      storagePrefix: STORAGE_PREFIX,
      prefs,
      sortOptions: RECENT_SORT_OPTIONS,
      allItems: items,
      emptyMessage: 'No matches.',
      onChange: (next: BrowsePrefs) => {
        prefs = next
        const shell = root.querySelector('.listening-page-shell')
        shell?.classList.add('listening-page-wide')
      },
    })
  }

  await load()
}
