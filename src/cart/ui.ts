import { classifyPlaylist, getPlaylistTrackEntries, spotifyErrorMessage } from '../spotify/api'
import {
  invalidateRemotePlaylistTracks,
  savePlaylistTracksToRemoteCache,
  savePlaylistsToRemoteCache,
} from '../api/playlistCache'
import { setCachedEntries, upsertCachedPlaylist } from '../spotify/playlistCache'
import { IMAGE_SIZES, renderImg } from '../spotify/images'
import type { SpotifyPlaylist } from '../spotify/types'
import {
  addToCart,
  clearCart,
  getCartCount,
  getCartTrackIds,
  getCartTracks,
  getCartUris,
  isInCart,
  removeFromCart,
  subscribeCart,
} from './cart'
import type { SpotifyTrack } from '../spotify/types'
import { iconCheck, iconPlus } from '../ui/icons'
import { mountCartGlass, unmountCartGlass } from './glass'

export const NICHE_TRACK_DRAG_TYPE = 'application/x-niche-track-id'

const CART_COLLAPSED_KEY = 'niche_cart_collapsed'
const ALSO_LIKED_KEY = 'niche_cart_also_liked'
import { appendTracksToPlaylist, createUserPlaylist, saveTracksToLiked } from './playlistActions'
import {
  bindPlaylistSearch,
  bindRecentPlaylists,
  filterRecentPlaylists,
  recentPlaylistsHtml,
} from '../playlist/playlistPickerUi'
import { loadRecent, pushRecentPlaylist } from '../playlist/recentActivity'

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export type CartUiContext = {
  getPlaylists: () => SpotifyPlaylist[]
  userId: string
  market: string
  onPlaylistsChanged: () => void | Promise<void>
  openPlaylist: (playlistId: string) => void
}

let ctx: CartUiContext | null = null
let barEl: HTMLElement | null = null
let modalEl: HTMLElement | null = null
/** Collapsed by default; set localStorage `niche_cart_collapsed` to `"false"` to stay expanded. */
let cartCollapsed = localStorage.getItem(CART_COLLAPSED_KEY) !== 'false'
let trackResolver: ((trackId: string) => SpotifyTrack | null) | null = null
let dropZoneBound = false

function dragHasTrackType(dt: DataTransfer | null): boolean {
  if (!dt) return false
  return Array.from(dt.types).includes(NICHE_TRACK_DRAG_TYPE)
}

export function setCartTrackResolver(
  resolver: ((trackId: string) => SpotifyTrack | null) | null
): void {
  trackResolver = resolver
}

function setCartCollapsed(collapsed: boolean): void {
  cartCollapsed = collapsed
  localStorage.setItem(CART_COLLAPSED_KEY, String(collapsed))
  applyCartBarBodyClass()
  renderCartBar()
}

function applyCartBarBodyClass(): void {
  document.body.classList.toggle('has-cart-bar', !cartCollapsed)
  document.body.classList.toggle('has-cart-bar-collapsed', cartCollapsed)
}

function flashCartBar(): void {
  barEl?.classList.add('cart-bar-flash')
  window.setTimeout(() => barEl?.classList.remove('cart-bar-flash'), 600)
}

function tryAddTrackFromDrag(trackId: string): boolean {
  const track = trackResolver?.(trackId)
  if (!track) return false
  if (isInCart(trackId)) return false
  addToCart(track)
  flashCartBar()
  return true
}

function bindCartDropZone(el: HTMLElement): void {
  if (dropZoneBound) return
  dropZoneBound = true

  document.addEventListener('dragend', () => {
    el.classList.remove('cart-bar-drop-active')
  })

  el.addEventListener('dragover', (e) => {
    if (!dragHasTrackType(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'copy'
    el.classList.add('cart-bar-drop-active')
  })

  el.addEventListener('dragleave', (e) => {
    const related = (e as DragEvent).relatedTarget as Node | null
    if (related && el.contains(related)) return
    el.classList.remove('cart-bar-drop-active')
  })

  el.addEventListener('drop', (e) => {
    el.classList.remove('cart-bar-drop-active')
    const trackId = e.dataTransfer?.getData(NICHE_TRACK_DRAG_TYPE)
    if (!trackId) return
    e.preventDefault()
    tryAddTrackFromDrag(trackId)
  })
}

function editablePlaylists(): SpotifyPlaylist[] {
  if (!ctx) return []
  return ctx
    .getPlaylists()
    .filter((p) => classifyPlaylist(p, ctx!.userId) !== 'followed')
}

function closeModal(): void {
  modalEl?.remove()
  modalEl = null
}

function showModal(html: string): void {
  closeModal()
  const overlay = document.createElement('div')
  overlay.className = 'replace-modal-overlay cart-modal-overlay'
  overlay.innerHTML = html
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal()
  })
  document.body.appendChild(overlay)
  modalEl = overlay
}


function alsoLikedChecked(): boolean {
  return localStorage.getItem(ALSO_LIKED_KEY) === 'true'
}

function setAlsoLikedChecked(checked: boolean): void {
  localStorage.setItem(ALSO_LIKED_KEY, String(checked))
}

function alsoLikedCheckboxHtml(checked = alsoLikedChecked()): string {
  return `
    <label class="cart-form-checkbox">
      <input type="checkbox" id="cart-also-liked" ${checked ? 'checked' : ''} />
      Also add to Liked Songs
    </label>
  `
}

function bindAlsoLikedCheckbox(overlay: HTMLElement): HTMLInputElement | null {
  const input = overlay.querySelector<HTMLInputElement>('#cart-also-liked')
  if (!input) return null
  input.addEventListener('change', () => setAlsoLikedChecked(input.checked))
  return input
}

async function addCartTracksToLiked(): Promise<void> {
  const ids = getCartTrackIds()
  if (!ids.length || !ctx) return
  await saveTracksToLiked(ids, ctx.userId)
}

function cartTrackRow(track: import('../spotify/types').SpotifyTrack): string {
  const artists = track.artists.map((a) => a.name).join(', ')
  const art = renderImg({
    images: track.album.images,
    targetWidth: IMAGE_SIZES.track,
    width: 40,
    height: 40,
    alt: track.name,
    loading: 'lazy',
    sizes: '40px',
  })
  return `
    <li class="cart-track-row">
      <div class="cart-track-main">
        ${art || '<span class="track-art-placeholder">♪</span>'}
        <div class="cart-track-meta">
          <span class="cart-track-name">${escapeHtml(track.name)}</span>
          <span class="cart-track-artists">${escapeHtml(artists)}</span>
        </div>
      </div>
      <span class="cart-track-duration">${formatDuration(track.duration_ms)}</span>
      <button
        type="button"
        class="btn-cart-remove"
        data-cart-remove="${track.id}"
        aria-label="Remove ${escapeHtml(track.name)} from cart"
      >Remove</button>
    </li>
  `
}

function cartBarActionsHtml(count: number): string {
  return `
    <button type="button" class="btn-cart-action" id="cart-view-btn" ${count ? '' : 'disabled'}>
      View
    </button>
    <button type="button" class="btn-cart-action btn-cart-action-primary" id="cart-create-btn" ${count ? '' : 'disabled'}>
      New playlist
    </button>
    <button type="button" class="btn-cart-action" id="cart-add-btn" ${count ? '' : 'disabled'}>
      Add to playlist
    </button>
    <button type="button" class="btn-cart-clear" id="cart-clear-btn" ${count ? '' : 'disabled'} title="Clear cart">
      Clear
    </button>
    <button
      type="button"
      class="btn-cart-collapse"
      id="cart-collapse-btn"
      title="Hide cart"
      aria-label="Hide cart"
    >Hide</button>
  `
}

function renderCartBar(): void {
  if (!barEl) return
  const count = getCartCount()

  if (cartCollapsed) {
    barEl.className = 'cart-bar cart-bar--collapsed'
    barEl.innerHTML = `
      <button
        type="button"
        class="cart-bar-collapsed-btn"
        id="cart-expand-btn"
        title="Show cart — drop tracks here to add"
      >
        Cart <span class="cart-bar-count">${count}</span>
        <span class="cart-bar-expand-hint" aria-hidden="true">▴</span>
      </button>
    `
    bindCartBarControls()
    applyCartGlassEffect()
    return
  }

  barEl.className = 'cart-bar cart-bar--expanded'
  barEl.title = 'Drop tracks here to add to cart'
  barEl.innerHTML = `
    <div class="cart-bar-inner">
      <span class="cart-bar-label">
        Cart <span class="cart-bar-count">${count}</span>
      </span>
      <div class="cart-bar-actions">
        ${cartBarActionsHtml(count)}
      </div>
    </div>
  `

  bindCartBarControls()
  applyCartGlassEffect()
}

function applyCartGlassEffect(): void {
  if (!barEl) return
  mountCartGlass(barEl)
}

function bindCartBarControls(): void {
  if (!barEl) return

  barEl.querySelector('#cart-expand-btn')?.addEventListener('click', () => {
    setCartCollapsed(false)
  })

  barEl.querySelector('#cart-collapse-btn')?.addEventListener('click', () => {
    setCartCollapsed(true)
  })

  barEl.querySelector('#cart-view-btn')?.addEventListener('click', openViewModal)
  barEl.querySelector('#cart-create-btn')?.addEventListener('click', openCreateModal)
  barEl.querySelector('#cart-add-btn')?.addEventListener('click', openAddToPlaylistModal)
  barEl.querySelector('#cart-clear-btn')?.addEventListener('click', () => {
    if (getCartCount() && confirm('Clear all tracks from the cart?')) {
      clearCart()
    }
  })
}

function bindCartModalRemove(overlay: HTMLElement): void {
  overlay.querySelectorAll<HTMLButtonElement>('[data-cart-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.cartRemove
      if (id) removeFromCart(id)
      if (getCartCount() === 0) closeModal()
      else openViewModal()
    })
  })
}

function openViewModal(): void {
  const tracks = getCartTracks()
  if (!tracks.length) return

  showModal(`
    <div class="replace-modal cart-modal" role="dialog" aria-labelledby="cart-modal-title">
      <h2 class="replace-modal-title" id="cart-modal-title">Cart</h2>
      <p class="replace-modal-hint">${tracks.length} track${tracks.length === 1 ? '' : 's'} — like a clipboard for building playlists.</p>
      <ul class="cart-track-list">
        ${tracks.map(cartTrackRow).join('')}
      </ul>
      <div class="replace-modal-actions">
        <button type="button" class="btn-replace-cancel" data-cart-close>Close</button>
        <button type="button" class="btn-replace-confirm" id="cart-modal-create">New playlist</button>
        <button type="button" class="btn-replace-confirm" id="cart-modal-add">Add to playlist</button>
      </div>
    </div>
  `)

  const overlay = modalEl!
  overlay.querySelector('[data-cart-close]')?.addEventListener('click', closeModal)
  overlay.querySelector('#cart-modal-create')?.addEventListener('click', () => {
    closeModal()
    openCreateModal()
  })
  overlay.querySelector('#cart-modal-add')?.addEventListener('click', () => {
    closeModal()
    openAddToPlaylistModal()
  })
  bindCartModalRemove(overlay)
}

function openCreateModal(): void {
  const count = getCartCount()
  if (!count || !ctx) return

  showModal(`
    <div class="replace-modal cart-modal" role="dialog" aria-labelledby="cart-create-title">
      <h2 class="replace-modal-title" id="cart-create-title">Create playlist from cart</h2>
      <p class="replace-modal-hint">Adds ${count} track${count === 1 ? '' : 's'} to a new private playlist.</p>
      <label class="cart-form-label">
        Playlist name
        <input type="text" class="cart-form-input" id="cart-new-name" value="From Niche cart" maxlength="100" />
      </label>
      ${alsoLikedCheckboxHtml()}
      <p class="cart-form-error" id="cart-form-error" hidden></p>
      <div class="replace-modal-actions">
        <button type="button" class="btn-replace-cancel" data-cart-close>Cancel</button>
        <button type="button" class="btn-replace-confirm" id="cart-create-submit">Create playlist</button>
      </div>
    </div>
  `)

  const overlay = modalEl!
  const nameInput = overlay.querySelector<HTMLInputElement>('#cart-new-name')!
  const errorEl = overlay.querySelector<HTMLElement>('#cart-form-error')!
  const submitBtn = overlay.querySelector<HTMLButtonElement>('#cart-create-submit')!
  const alsoLikedInput = bindAlsoLikedCheckbox(overlay)

  overlay.querySelector('[data-cart-close]')?.addEventListener('click', closeModal)

  submitBtn.addEventListener('click', () => {
    void (async () => {
      const name = nameInput.value.trim()
      if (!name) {
        errorEl.textContent = 'Enter a playlist name.'
        errorEl.hidden = false
        return
      }

      errorEl.hidden = true
      submitBtn.disabled = true
      submitBtn.textContent = 'Creating…'

      try {
        const uris = getCartUris()
        const alsoLiked = alsoLikedInput?.checked ?? false
        const playlist = await createUserPlaylist(ctx!.userId, name)
        await appendTracksToPlaylist(playlist.id, uris)
        if (alsoLiked) await addCartTracksToLiked()
        upsertCachedPlaylist(
          {
            ...playlist,
            tracks: { total: uris.length },
          },
          ctx!.userId
        )
        await ctx!.onPlaylistsChanged()
        void savePlaylistsToRemoteCache(ctx!.userId, ctx!.market, ctx!.getPlaylists())
        clearCart()
        closeModal()
        ctx!.openPlaylist(playlist.id)
      } catch (err) {
        errorEl.textContent = spotifyErrorMessage(err)
        errorEl.hidden = false
        submitBtn.disabled = false
        submitBtn.textContent = 'Create playlist'
      }
    })()
  })

  nameInput.focus()
  nameInput.select()
}

function playlistPickerRow(p: SpotifyPlaylist): string {
  const owner = p.owner?.display_name ?? p.owner?.id ?? ''
  const art = renderImg({
    images: p.images,
    targetWidth: IMAGE_SIZES.track,
    width: 40,
    height: 40,
    alt: p.name,
    loading: 'lazy',
    sizes: '40px',
  })
  return `
    <button type="button" class="cart-playlist-pick" data-playlist-id="${p.id}">
      ${art || '<span class="track-art-placeholder">♪</span>'}
      <span class="cart-playlist-pick-meta">
        <span class="cart-playlist-pick-name">${escapeHtml(p.name)}</span>
        <span class="cart-playlist-pick-sub">${escapeHtml(owner)} · ${p.tracks.total} tracks</span>
      </span>
    </button>
  `
}

function openAddToPlaylistModal(): void {
  const count = getCartCount()
  if (!count || !ctx) return

  const playlists = editablePlaylists()
  if (!playlists.length) {
    showModal(`
      <div class="replace-modal cart-modal" role="dialog">
        <h2 class="replace-modal-title">Add to playlist</h2>
        <p class="replace-modal-body">You don't have any playlists you can edit. Create a new one instead.</p>
        <div class="replace-modal-actions">
          <button type="button" class="btn-replace-cancel" data-cart-close>Close</button>
          <button type="button" class="btn-replace-confirm" id="cart-fallback-create">New playlist</button>
        </div>
      </div>
    `)
    modalEl!.querySelector('[data-cart-close]')?.addEventListener('click', closeModal)
    modalEl!.querySelector('#cart-fallback-create')?.addEventListener('click', () => {
      closeModal()
      openCreateModal()
    })
    return
  }

  const allowedIds = new Set(playlists.map((p) => p.id))
  const recentItems = filterRecentPlaylists(loadRecent(ctx.userId), allowedIds)

  showModal(`
    <div class="replace-modal cart-modal cart-modal-wide" role="dialog" aria-labelledby="cart-add-title">
      <h2 class="replace-modal-title" id="cart-add-title">Add to playlist</h2>
      <p class="replace-modal-hint">Adds ${count} track${count === 1 ? '' : 's'} to the end of the playlist you choose.</p>
      <input
        type="search"
        class="cart-form-input cart-playlist-search"
        id="cart-playlist-search"
        placeholder="Search your playlists…"
        autocomplete="off"
      />
      ${recentPlaylistsHtml(recentItems)}
      <div class="cart-playlist-picks" id="cart-playlist-picks">
        ${playlists.map(playlistPickerRow).join('')}
      </div>
      ${alsoLikedCheckboxHtml()}
      <p class="cart-form-error" id="cart-form-error" hidden></p>
      <div class="replace-modal-actions">
        <button type="button" class="btn-replace-cancel" data-cart-close>Cancel</button>
      </div>
    </div>
  `)

  const overlay = modalEl!
  const errorEl = overlay.querySelector<HTMLElement>('#cart-form-error')!
  const picksEl = overlay.querySelector<HTMLElement>('#cart-playlist-picks')!
  const searchInput = overlay.querySelector<HTMLInputElement>('#cart-playlist-search')!
  const alsoLikedInput = bindAlsoLikedCheckbox(overlay)

  overlay.querySelector('[data-cart-close]')?.addEventListener('click', closeModal)

  bindPlaylistSearch(searchInput, picksEl)

  const addToPlaylist = (playlistId: string): void => {
    void (async () => {
      const playlist = playlists.find((p) => p.id === playlistId)
      if (!playlist || !ctx) return

      pushRecentPlaylist(ctx.userId, playlist.id, playlist.name)

      errorEl.hidden = true
      picksEl.querySelectorAll('button').forEach((b) => {
        b.disabled = true
      })
      if (alsoLikedInput) alsoLikedInput.disabled = true

      try {
        const uris = getCartUris()
        const alsoLiked = alsoLikedInput?.checked ?? false
        await appendTracksToPlaylist(playlistId, uris)
        if (alsoLiked) await addCartTracksToLiked()
        await invalidateRemotePlaylistTracks(ctx.userId, playlistId, ctx.market)
        const entries = await getPlaylistTrackEntries(playlistId, ctx.market)
        setCachedEntries(playlistId, ctx.market, entries)
        void savePlaylistTracksToRemoteCache(
          ctx.userId,
          playlistId,
          ctx.market,
          entries
        )
        upsertCachedPlaylist(
          {
            ...playlist,
            tracks: { total: entries.length },
          },
          ctx.userId
        )
        await ctx.onPlaylistsChanged()
        clearCart()
        closeModal()
        ctx.openPlaylist(playlistId)
      } catch (err) {
        errorEl.textContent = spotifyErrorMessage(err)
        errorEl.hidden = false
        picksEl.querySelectorAll('button').forEach((b) => {
          b.disabled = false
        })
        if (alsoLikedInput) alsoLikedInput.disabled = false
      }
    })()
  }

  bindRecentPlaylists(overlay, recentItems, addToPlaylist)

  picksEl.querySelectorAll<HTMLButtonElement>('.cart-playlist-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      const playlistId = btn.dataset.playlistId
      if (playlistId) addToPlaylist(playlistId)
    })
  })

  searchInput.focus()
}

export function updateCartButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLButtonElement>('.btn-add-cart[data-track-id]').forEach((btn) => {
    const inCart = btn.dataset.trackId ? isInCart(btn.dataset.trackId) : false
    btn.classList.toggle('in-cart', inCart)
    btn.innerHTML = inCart ? iconCheck(16) : iconPlus(16)
    btn.setAttribute('aria-pressed', String(inCart))
  })
  root.querySelectorAll<HTMLElement>('.album-cell[data-track-id]').forEach((cell) => {
    const inCart = cell.dataset.trackId ? isInCart(cell.dataset.trackId) : false
    cell.classList.toggle('album-cell-in-cart', inCart)
  })
  root.querySelectorAll<HTMLElement>('.track-row[data-track-id]').forEach((row) => {
    const inCart = row.dataset.trackId ? isInCart(row.dataset.trackId) : false
    row.classList.toggle('track-row-in-cart', inCart)
  })
}

export function mountCartUI(context: CartUiContext): void {
  ctx = context
  barEl?.remove()
  barEl = document.createElement('div')
  barEl.id = 'niche-cart-bar'
  barEl.className = 'cart-bar'
  document.body.appendChild(barEl)

  subscribeCart(() => {
    renderCartBar()
    updateCartButtons()
  })

  bindCartDropZone(barEl)
  applyCartBarBodyClass()
  renderCartBar()
}

export function unmountCartUI(): void {
  closeModal()
  unmountCartGlass()
  barEl?.remove()
  barEl = null
  ctx = null
  trackResolver = null
  dropZoneBound = false
  document.body.classList.remove('has-cart-bar', 'has-cart-bar-collapsed')
}
