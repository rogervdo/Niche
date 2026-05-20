import { iconGear } from '../ui/icons'
import {
  bindVisualizerSettings,
  previewSettingsPopupBodyHtml,
} from './previewVisualizerTuning'

const PANEL_OPEN_KEY = 'niche_preview_settings_open'

export function isPreviewSettingsOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function setPreviewSettingsOpen(open: boolean): void {
  try {
    localStorage.setItem(PANEL_OPEN_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function syncPopupUi(root: HTMLElement, open: boolean): void {
  const gear = root.querySelector('#preview-settings-toggle')
  const popup = root.querySelector('.preview-settings-popup')
  gear?.classList.toggle('is-active', open)
  gear?.setAttribute('aria-expanded', String(open))
  popup?.classList.toggle('is-open', open)
  popup?.setAttribute('aria-hidden', String(!open))
}

function closePreviewSettings(root: HTMLElement): void {
  if (!isPreviewSettingsOpen()) return
  setPreviewSettingsOpen(false)
  syncPopupUi(root, false)
}

export function previewSettingsControlsHtml(): string {
  const open = isPreviewSettingsOpen()
  return `
    <div class="preview-settings-anchor">
      <button
        type="button"
        class="btn-preview-settings${open ? ' is-active' : ''}"
        id="preview-settings-toggle"
        aria-expanded="${open}"
        aria-haspopup="dialog"
        aria-controls="preview-settings-popup"
        aria-label="Preview settings"
        title="Preview settings"
      >${iconGear(16)}</button>
      <div
        class="preview-settings-popup${open ? ' is-open' : ''}"
        id="preview-settings-popup"
        role="dialog"
        aria-label="Preview settings"
        aria-hidden="${!open}"
      >
        ${previewSettingsPopupBodyHtml()}
      </div>
    </div>
  `
}

let boundRoot: HTMLElement | null = null

export function bindPreviewSettings(root: HTMLElement): void {
  if (boundRoot === root) return
  boundRoot = root

  bindVisualizerSettings(root)

  root.addEventListener('click', (e) => {
    const gear = (e.target as HTMLElement).closest('#preview-settings-toggle')
    if (gear) {
      e.stopPropagation()
      const open = !isPreviewSettingsOpen()
      setPreviewSettingsOpen(open)
      syncPopupUi(root, open)
      return
    }
    const anchor = root.querySelector('.preview-settings-anchor')
    if (anchor?.contains(e.target as Node)) return
    closePreviewSettings(root)
  })

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreviewSettings(root)
  })
}

/** Re-render popup body (e.g. after a section reset). */
export function refreshPreviewSettingsPopup(root: HTMLElement): void {
  const popup = root.querySelector('#preview-settings-popup')
  if (popup) popup.innerHTML = previewSettingsPopupBodyHtml()
}
