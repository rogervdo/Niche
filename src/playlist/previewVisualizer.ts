import { getPreviewAnalyser, isPreviewPlaying, onPreviewStop } from './previewPlayer'
import {
  isVisualizerEnabled,
  tuningInputGain,
  tuningLoudThreshold,
} from './previewVisualizerTuning'

const BAR_COUNT = 24
const IDLE_LEVEL = 0.05
const QUIET_CAP = 0.22
const PEAK_LEVEL = 0.96
const PEAK_DECAY = 0.91
const FRAME_LERP = 0.1
const RISE_LERP = 0.38
let rafId: number | null = null
let resizeObserver: ResizeObserver | null = null
let activeCanvas: HTMLCanvasElement | null = null
let barPeaks: Float32Array | null = null
let displayLevels: Float32Array | null = null
let bandRanges: [number, number][] | null = null
let accentColor = '#1db954'

function stopLoop(): void {
  if (rafId != null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  barPeaks = null
  displayLevels = null
  bandRanges = null
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
}

/** Use ~75% of FFT bins so the rightmost bars stop below airy top-end Hz. */
const HIGH_FREQ_BIN_RATIO = 0.75

/**
 * Log-spaced bands: bar 0 (left) = bass, bar N-1 (right) = treble.
 * Skips DC/near-DC bins so the leftmost bars respond to real low end.
 */
function logBandRanges(binCount: number): [number, number][] {
  const ranges: [number, number][] = []
  const minBin = 2
  const maxBin = Math.max(
    minBin + 1,
    Math.floor((binCount - 1) * HIGH_FREQ_BIN_RATIO)
  )
  const logMin = Math.log(minBin)
  const logMax = Math.log(maxBin)

  for (let bar = 0; bar < BAR_COUNT; bar++) {
    const f0 = bar / BAR_COUNT
    const f1 = (bar + 1) / BAR_COUNT
    const start = Math.floor(Math.exp(logMin + (logMax - logMin) * f0))
    const end = Math.max(
      start + 1,
      Math.floor(Math.exp(logMin + (logMax - logMin) * f1))
    )
    ranges.push([start, Math.min(binCount, end)])
  }
  return ranges
}

/** Slight highs lift so treble bars aren't flat vs bass. */
function trebleGain(barIndex: number): number {
  const t = barIndex / Math.max(1, BAR_COUNT - 1)
  return 1 + t * t * 0.65
}

function fakeLevels(t: number): number[] {
  const playing = isPreviewPlaying()
  const amp = playing ? 1 : 0.15
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const wave =
      Math.abs(Math.sin(t * 2.4 + i * 0.42)) * 0.55 +
      Math.abs(Math.sin(t * 1.1 + i * 0.24)) * 0.35
    return (0.12 + wave * 0.78) * amp
  })
}

function normalizeBand(value: number): number {
  return (1 - Math.exp(-1.6 * Math.min(1, value))) * tuningInputGain()
}

/**
 * Wide output range: quiet audio stays low; only stronger signal pushes bars up.
 * Avoids frame-normalize (that equalizes every bar to the same height).
 */
function expandDynamics(level: number): number {
  const loudThreshold = tuningLoudThreshold()
  if (level <= 0.015) return IDLE_LEVEL * (level / 0.015)
  if (level < loudThreshold) {
    const t = (level - 0.015) / (loudThreshold - 0.015)
    return IDLE_LEVEL + t * (QUIET_CAP - IDLE_LEVEL)
  }
  const excess = (level - loudThreshold) / (1 - loudThreshold)
  return QUIET_CAP + Math.pow(excess, 0.48) * (PEAK_LEVEL - QUIET_CAP)
}

function realLevels(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number[] {
  analyser.getByteFrequencyData(buffer)
  if (!bandRanges || bandRanges.length !== BAR_COUNT) {
    bandRanges = logBandRanges(buffer.length)
  }

  const raw: number[] = []
  for (let bar = 0; bar < BAR_COUNT; bar++) {
    const [start, end] = bandRanges[bar] ?? [0, 1]
    let peak = 0
    for (let j = start; j < end; j++) {
      const v = buffer[j] ?? 0
      if (v > peak) peak = v
    }
    raw.push(normalizeBand((peak / 255) * trebleGain(bar)))
  }

  const shaped = raw.map((v) => expandDynamics(v))

  if (!barPeaks || barPeaks.length !== BAR_COUNT) {
    barPeaks = new Float32Array(BAR_COUNT)
  }
  if (!displayLevels || displayLevels.length !== BAR_COUNT) {
    displayLevels = new Float32Array(BAR_COUNT)
  }

  const out: number[] = []
  for (let i = 0; i < BAR_COUNT; i++) {
    const level = shaped[i] ?? 0
    const prev = barPeaks[i] ?? 0
    const held = level > prev ? level : prev * PEAK_DECAY
    barPeaks[i] = held
    const target = level > prev ? level * 0.55 + held * 0.45 : level * 0.25 + held * 0.75

    const shown = displayLevels[i] ?? 0
    const lerp = target > shown ? RISE_LERP : FRAME_LERP
    const next = shown + (target - shown) * lerp
    displayLevels[i] = next
    out.push(next)
  }
  return out
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  levels: number[]
): void {
  ctx.clearRect(0, 0, w, h)
  const gap = Math.max(1, Math.floor(w * 0.005))
  const barW = Math.max(2, (w - gap * (BAR_COUNT - 1)) / BAR_COUNT)

  ctx.fillStyle = accentColor
  for (let i = 0; i < BAR_COUNT; i++) {
    const level = Math.min(1, levels[i] ?? 0)
    const barH = Math.max(2, level * h * 0.94)
    const x = i * (barW + gap)
    const y = h - barH
    ctx.beginPath()
    ctx.roundRect(x, y, barW, barH, Math.min(barW / 2, 2))
    ctx.fill()
  }
}

function startLoop(canvas: HTMLCanvasElement): void {
  stopLoop()
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent')
    .trim()
  if (accent) accentColor = accent

  resizeCanvas(canvas)
  const analyser = getPreviewAnalyser()
  const freqBuffer =
    analyser != null
      ? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
      : null
  let useFake = analyser == null
  let silentFrames = 0

  const tick = (now: number): void => {
    rafId = requestAnimationFrame(tick)
    resizeCanvas(canvas)
    const w = canvas.width
    const h = canvas.height

    let levels: number[]
    const playing = isPreviewPlaying()
    if (!playing) {
      useFake = analyser == null
      silentFrames = 0
    }

    if (!useFake && analyser && freqBuffer && playing) {
      levels = realLevels(analyser, freqBuffer)
      const peak = levels.reduce((m, v) => Math.max(m, v), 0)
      if (peak < 0.04) {
        silentFrames += 1
        if (silentFrames > 12) useFake = true
      } else {
        silentFrames = 0
      }
    } else {
      levels = fakeLevels(now / 1000).map((v) => expandDynamics(v * 0.55))
      if (useFake && analyser && freqBuffer && playing) {
        const probe = realLevels(analyser, freqBuffer)
        const peak = probe.reduce((m, v) => Math.max(m, v), 0)
        if (peak >= 0.04) {
          useFake = false
          silentFrames = 0
          levels = probe
        }
      }
    }

    drawBars(ctx, w, h, levels)
  }

  rafId = requestAnimationFrame(tick)
}

export function stopPreviewVisualizer(): void {
  stopLoop()
  resizeObserver?.disconnect()
  resizeObserver = null
  activeCanvas = null
}

export function startPreviewVisualizer(canvas: HTMLCanvasElement): void {
  if (!isVisualizerEnabled()) return
  if (activeCanvas === canvas && rafId != null) return
  stopPreviewVisualizer()
  activeCanvas = canvas
  resizeObserver = new ResizeObserver(() => resizeCanvas(canvas))
  resizeObserver.observe(canvas)
  startLoop(canvas)
}

onPreviewStop(() => stopPreviewVisualizer())

window.addEventListener('niche-viz-tuning-changed', () => {
  bandRanges = null
  if (!isVisualizerEnabled()) stopPreviewVisualizer()
})
