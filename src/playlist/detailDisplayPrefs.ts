import { iconHeart, iconHeartOutline } from '../ui/icons'

const SHOW_LIKED_HEARTS_KEY = 'niche_detail_show_liked_hearts'

export const LIKED_HEARTS_PREF_EVENT = 'niche-liked-hearts-pref-changed'

export function isShowLikedHeartsEnabled(): boolean {
  try {
    const v = localStorage.getItem(SHOW_LIKED_HEARTS_KEY)
    if (v === null) return true
    return v === 'true'
  } catch {
    return true
  }
}

export function setShowLikedHeartsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SHOW_LIKED_HEARTS_KEY, enabled ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

export function likedHeartsSettingsSectionHtml(): string {
  const on = isShowLikedHeartsEnabled()
  return `
    <section
      class="preview-settings-section"
      data-settings-section="liked-hearts"
      aria-labelledby="preview-settings-liked-heading"
    >
      <h4 class="preview-settings-section-title" id="preview-settings-liked-heading">Tracks</h4>
      <button
        type="button"
        class="preview-settings-liked-toggle-row"
        id="show-liked-hearts-toggle"
        aria-pressed="${on}"
        aria-label="${on ? 'Hide Liked Songs hearts on tracks' : 'Show Liked Songs hearts on tracks'}"
        title="${on ? 'Hide' : 'Show'} Liked Songs hearts on tracks"
      >
        <span class="preview-liked-toggle${on ? ' active' : ''}" aria-hidden="true">${on ? iconHeart(18) : iconHeartOutline(18)}</span>
        <span class="preview-settings-liked-label">Show liked hearts</span>
      </button>
    </section>
  `
}

export function syncLikedHeartsSettingsUi(root: HTMLElement): void {
  const btn = root.querySelector<HTMLButtonElement>('#show-liked-hearts-toggle')
  if (!btn) return
  const on = isShowLikedHeartsEnabled()
  btn.classList.toggle('active', on)
  btn.setAttribute('aria-pressed', String(on))
  const icon = btn.querySelector<HTMLElement>('.preview-liked-toggle')
  if (icon) {
    icon.classList.toggle('active', on)
    icon.innerHTML = on ? iconHeart(18) : iconHeartOutline(18)
  }
  const label = on
    ? 'Hide Liked Songs hearts on tracks'
    : 'Show Liked Songs hearts on tracks'
  btn.title = label
  btn.setAttribute('aria-label', label)
}

let likedHeartsSettingsBound = false

export function bindLikedHeartsSettings(root: HTMLElement): void {
  if (likedHeartsSettingsBound) return
  likedHeartsSettingsBound = true

  root.addEventListener(
    'click',
    (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
        '#show-liked-hearts-toggle'
      )
      if (!btn) return
      e.preventDefault()
      e.stopPropagation()
      setShowLikedHeartsEnabled(!isShowLikedHeartsEnabled())
      syncLikedHeartsSettingsUi(root)
      window.dispatchEvent(new CustomEvent(LIKED_HEARTS_PREF_EVENT))
    },
    true
  )
}
