import { applyPreviewAnalyserTuning } from './previewPlayer'

const TUNING_CHANGED = 'niche-viz-tuning-changed'

export type VisualizerTuning = {
  enabled: boolean
  sensitivityDb: number
  smoothingLevel: number
  multiplier: number
  fftSize: number
  loudThreshold: number
}

const STORAGE_KEY = 'niche_viz_tuning_v2'

export const DEFAULT_VISUALIZER_TUNING: VisualizerTuning = {
  enabled: true,
  sensitivityDb: 48,
  smoothingLevel: 7,
  multiplier: 100,
  fftSize: 2048,
  loudThreshold: 0.45,
}

let tuning: VisualizerTuning = { ...DEFAULT_VISUALIZER_TUNING }

function loadTuning(): VisualizerTuning {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_VISUALIZER_TUNING }
    const parsed = JSON.parse(raw) as Partial<VisualizerTuning>
    return {
      enabled: parsed.enabled !== false,
      sensitivityDb: clampNum(parsed.sensitivityDb, 15, 80, DEFAULT_VISUALIZER_TUNING.sensitivityDb),
      smoothingLevel: clampNum(parsed.smoothingLevel, 1, 10, DEFAULT_VISUALIZER_TUNING.smoothingLevel),
      multiplier: clampNum(parsed.multiplier, 5, 100, DEFAULT_VISUALIZER_TUNING.multiplier),
      fftSize: pickFft(parsed.fftSize),
      loudThreshold: clampNum(parsed.loudThreshold, 0.1, 0.6, DEFAULT_VISUALIZER_TUNING.loudThreshold),
    }
  } catch {
    return { ...DEFAULT_VISUALIZER_TUNING }
  }
}

function clampNum(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

const FFT_OPTIONS = [512, 1024, 2048, 4096] as const

function pickFft(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return FFT_OPTIONS.includes(n as (typeof FFT_OPTIONS)[number])
    ? n
    : DEFAULT_VISUALIZER_TUNING.fftSize
}

tuning = loadTuning()

export function getVisualizerTuning(): VisualizerTuning {
  return tuning
}

export function isVisualizerEnabled(): boolean {
  return tuning.enabled
}

function persistTuning(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning))
  } catch {
    /* ignore */
  }
}

export function setVisualizerTuning(patch: Partial<VisualizerTuning>): void {
  tuning = {
    ...tuning,
    ...patch,
    fftSize: patch.fftSize != null ? pickFft(patch.fftSize) : tuning.fftSize,
  }
  persistTuning()
  applyPreviewAnalyserTuning()
  window.dispatchEvent(new CustomEvent(TUNING_CHANGED))
}

export function tuningToAnalyser(): {
  minDecibels: number
  maxDecibels: number
  smoothingTimeConstant: number
  fftSize: number
} {
  const maxDecibels = -6
  const minDecibels = maxDecibels - tuning.sensitivityDb
  const smoothingTimeConstant =
    0.08 + ((tuning.smoothingLevel - 1) / 9) * 0.84
  return {
    minDecibels,
    maxDecibels,
    smoothingTimeConstant,
    fftSize: tuning.fftSize,
  }
}

export function tuningInputGain(): number {
  return (tuning.multiplier / 40) * 0.72
}

export function tuningLoudThreshold(): number {
  return tuning.loudThreshold
}

function sliderRow(
  id: string,
  label: string,
  value: number | string,
  min: number,
  max: number,
  step: number,
  hint: string
): string {
  return `
    <div class="preview-settings-row">
      <div class="preview-settings-row-head">
        <label class="preview-settings-label" for="${id}">${label}</label>
        <output class="preview-settings-value" id="${id}-out">${value}</output>
      </div>
      <input
        type="range"
        class="preview-settings-slider"
        data-settings-section="visualizer"
        id="${id}"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}"
      />
      <p class="preview-settings-hint">${hint}</p>
    </div>
  `
}

export function visualizerSettingsSectionHtml(): string {
  const t = getVisualizerTuning()
  const fftIdx = Math.max(0, FFT_OPTIONS.indexOf(t.fftSize as (typeof FFT_OPTIONS)[number]))
  const disabledAttr = t.enabled ? '' : ' disabled'
  return `
    <section
      class="preview-settings-section${t.enabled ? '' : ' is-viz-tuning-disabled'}"
      data-settings-section="visualizer"
      aria-labelledby="preview-settings-viz-heading"
    >
      <h4 class="preview-settings-section-title" id="preview-settings-viz-heading">Visualizer</h4>
      <p class="preview-settings-section-desc">Audio bar display (Monstercat-style).</p>
      <div class="preview-settings-row preview-settings-enable-row">
        <label class="preview-settings-enable-label" for="viz-enabled">
          <input
            type="checkbox"
            id="viz-enabled"
            data-settings-section="visualizer"
            ${t.enabled ? 'checked' : ''}
          />
          <span>Show visualizer while preview plays</span>
        </label>
      </div>
      <div class="preview-settings-viz-tuning"${disabledAttr}>
      ${sliderRow(
        'viz-sensitivity',
        'Sensitivity',
        t.sensitivityDb,
        15,
        80,
        1,
        'dB range. Higher responds to quieter sound and taller bars.'
      )}
      ${sliderRow(
        'viz-smoothing',
        'Smoothing',
        t.smoothingLevel,
        1,
        10,
        1,
        'Higher = smoother; lower = faster reaction.'
      )}
      ${sliderRow(
        'viz-multiplier',
        'Multiplier',
        t.multiplier,
        5,
        100,
        1,
        'Boosts bar height and separation.'
      )}
      <div class="preview-settings-row">
        <div class="preview-settings-row-head">
          <label class="preview-settings-label" for="viz-fft">Sound resolution</label>
          <output class="preview-settings-value" id="viz-fft-out">${t.fftSize}</output>
        </div>
        <input
          type="range"
          class="preview-settings-slider"
          data-settings-section="visualizer"
          id="viz-fft"
          min="0"
          max="${FFT_OPTIONS.length - 1}"
          step="1"
          value="${fftIdx}"
        />
        <p class="preview-settings-hint">FFT size (512–4096). Higher = more detail, more CPU.</p>
      </div>
      ${sliderRow(
        'viz-loud-threshold',
        'Loud threshold',
        t.loudThreshold,
        0.1,
        0.6,
        0.01,
        'How loud audio must be before bars jump up.'
      )}
      <button
        type="button"
        class="preview-settings-reset"
        data-settings-reset="visualizer"
        id="viz-settings-reset"
        ${disabledAttr}
      >Reset visualizer defaults</button>
      </div>
    </section>
  `
}

/** Popup body: add new sections here as more preview options ship. */
export function previewSettingsPopupBodyHtml(): string {
  return `
    <div class="preview-settings-popup-inner">
      <h3 class="preview-settings-heading">Preview settings</h3>
      <div class="preview-settings-sections">
        ${visualizerSettingsSectionHtml()}
      </div>
    </div>
  `
}

export function refreshVisualizerSettingsSection(root: HTMLElement): void {
  const slot = root.querySelector(
    '[data-settings-section="visualizer"]'
  )
  if (slot) slot.outerHTML = visualizerSettingsSectionHtml()
  else syncVisualizerSliderOutputs(root)
}

let vizBoundRoot: HTMLElement | null = null

export function bindVisualizerSettings(root: HTMLElement): void {
  if (vizBoundRoot === root) return
  vizBoundRoot = root

  root.addEventListener('change', (e) => {
    const target = e.target as HTMLElement
    if (target.id !== 'viz-enabled') return
    setVisualizerTuning({ enabled: (target as HTMLInputElement).checked })
    refreshVisualizerSettingsSection(root)
  })

  root.addEventListener('input', (e) => {
    const target = e.target as HTMLElement
    if (!target.classList.contains('preview-settings-slider')) return
    if (target.getAttribute('data-settings-section') !== 'visualizer') return
    if (!isVisualizerEnabled()) return

    const id = target.id
    const patch: Partial<VisualizerTuning> = {}

    if (id === 'viz-sensitivity') {
      patch.sensitivityDb = Number((target as HTMLInputElement).value)
      setOut(root, 'viz-sensitivity-out', `${patch.sensitivityDb} dB`)
    } else if (id === 'viz-smoothing') {
      patch.smoothingLevel = Number((target as HTMLInputElement).value)
      setOut(root, 'viz-smoothing-out', String(patch.smoothingLevel))
    } else if (id === 'viz-multiplier') {
      patch.multiplier = Number((target as HTMLInputElement).value)
      setOut(root, 'viz-multiplier-out', String(patch.multiplier))
    } else if (id === 'viz-fft') {
      const idx = Number((target as HTMLInputElement).value)
      patch.fftSize = FFT_OPTIONS[idx] ?? DEFAULT_VISUALIZER_TUNING.fftSize
      setOut(root, 'viz-fft-out', String(patch.fftSize))
    } else if (id === 'viz-loud-threshold') {
      patch.loudThreshold = Number((target as HTMLInputElement).value)
      setOut(root, 'viz-loud-threshold-out', patch.loudThreshold.toFixed(2))
    } else {
      return
    }

    setVisualizerTuning(patch)
  })

  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-settings-reset="visualizer"]')
    if (!btn || (btn as HTMLButtonElement).disabled) return
    tuning = { ...DEFAULT_VISUALIZER_TUNING }
    persistTuning()
    applyPreviewAnalyserTuning()
    window.dispatchEvent(new CustomEvent(TUNING_CHANGED))
    refreshVisualizerSettingsSection(root)
  })
}

function setOut(root: HTMLElement, id: string, text: string): void {
  root.querySelector(`#${id}`)?.replaceChildren(document.createTextNode(text))
}

function syncVisualizerSliderOutputs(root: HTMLElement): void {
  const t = getVisualizerTuning()
  const fftIdx = FFT_OPTIONS.indexOf(t.fftSize as (typeof FFT_OPTIONS)[number])
  const fftSlider = root.querySelector<HTMLInputElement>('#viz-fft')
  if (fftSlider && fftIdx >= 0) fftSlider.value = String(fftIdx)

  setOut(root, 'viz-sensitivity-out', `${t.sensitivityDb} dB`)
  setOut(root, 'viz-smoothing-out', String(t.smoothingLevel))
  setOut(root, 'viz-multiplier-out', String(t.multiplier))
  setOut(root, 'viz-fft-out', String(t.fftSize))
  setOut(root, 'viz-loud-threshold-out', t.loudThreshold.toFixed(2))
}
