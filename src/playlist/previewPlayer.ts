import { measurePreviewGain } from './previewLoudness'
import { tuningToAnalyser } from './previewVisualizerTuning'

const PREVIEW_DURATION_MS = 20_000
/** Master level for previews before per-track loudness adjustment. */
const PREVIEW_VOLUME = 0.72

const audioBlobUrlBySource = new Map<string, string>()
const playbackGainBySource = new Map<string, number>()
const audioFetchInFlight = new Map<string, Promise<string>>()

let audioEl: HTMLAudioElement | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null
let unlocked = false
let lastError: string | null = null
let currentSourceUrl: string | null = null

let audioContext: AudioContext | null = null
let gainNode: GainNode | null = null
let analyserNode: AnalyserNode | null = null
let mediaSource: MediaElementAudioSourceNode | null = null

const previewStopListeners = new Set<() => void>()

export function onPreviewStop(listener: () => void): () => void {
  previewStopListeners.add(listener)
  return () => previewStopListeners.delete(listener)
}

function notifyPreviewStop(): void {
  for (const listener of previewStopListeners) listener()
}

function ensureAnalyser(audio: HTMLAudioElement): AnalyserNode | null {
  try {
    if (!audioContext) {
      audioContext = new AudioContext()
    }
    if (!mediaSource) {
      mediaSource = audioContext.createMediaElementSource(audio)
      gainNode = audioContext.createGain()
      analyserNode = audioContext.createAnalyser()
      applyPreviewAnalyserTuning()
      mediaSource.connect(gainNode)
      gainNode.connect(analyserNode)
      analyserNode.connect(audioContext.destination)
    }
    if (audioContext.state === 'suspended') {
      void audioContext.resume()
    }
    return analyserNode
  } catch {
    return null
  }
}

export function getPreviewAnalyser(): AnalyserNode | null {
  return analyserNode
}

export function applyPreviewAnalyserTuning(): void {
  if (!analyserNode) return
  const { minDecibels, maxDecibels, smoothingTimeConstant, fftSize } =
    tuningToAnalyser()
  analyserNode.minDecibels = minDecibels
  analyserNode.maxDecibels = maxDecibels
  analyserNode.smoothingTimeConstant = smoothingTimeConstant
  analyserNode.fftSize = fftSize
}

export function isPreviewPlaying(): boolean {
  return Boolean(audioEl && !audioEl.paused && !audioEl.ended && audioEl.currentTime > 0)
}

function applyPlaybackLevel(linearGain: number): void {
  const level = Math.min(1, Math.max(0, linearGain))
  if (gainNode) {
    gainNode.gain.value = level
  } else if (audioEl) {
    audioEl.volume = level
  }
}

function applyCurrentGain(previewUrl: string): void {
  const gain = playbackGainBySource.get(previewUrl) ?? PREVIEW_VOLUME
  applyPlaybackLevel(gain)
  if (audioEl) audioEl.volume = gain
}

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = document.createElement('audio')
    audioEl.preload = 'auto'
    audioEl.volume = PREVIEW_VOLUME
    audioEl.style.display = 'none'
    document.body.appendChild(audioEl)
  }
  return audioEl
}

/** Call on a user gesture (e.g. Grid tab click) so hover previews can play. */
export function unlockPreviewAudio(): void {
  unlocked = true
  const audio = ensureAudio()
  audio.muted = true
  void audio
    .play()
    .then(() => {
      audio.pause()
      audio.currentTime = 0
      audio.muted = false
    })
    .catch(() => {
      audio.muted = false
    })
}

export function getPreviewError(): string | null {
  return lastError
}

async function cachedPlaybackUrl(previewUrl: string): Promise<string> {
  const cached = audioBlobUrlBySource.get(previewUrl)
  if (cached) return cached

  const existing = audioFetchInFlight.get(previewUrl)
  if (existing) return existing

  const promise = (async () => {
    const res = await fetch(previewUrl)
    if (!res.ok) throw new Error('Preview failed to load')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    audioBlobUrlBySource.set(previewUrl, objectUrl)
    playbackGainBySource.set(previewUrl, PREVIEW_VOLUME)
    void applyMeasuredGain(previewUrl, blob)
    return objectUrl
  })().finally(() => {
    audioFetchInFlight.delete(previewUrl)
  })

  audioFetchInFlight.set(previewUrl, promise)
  return promise
}

async function applyMeasuredGain(previewUrl: string, blob: Blob): Promise<void> {
  const trackGain = await measurePreviewGain(blob, previewUrl)
  const gain = PREVIEW_VOLUME * trackGain
  playbackGainBySource.set(previewUrl, gain)
  if (currentSourceUrl === previewUrl) applyCurrentGain(previewUrl)
}

export function stopPreview(): void {
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = null
  }
  currentSourceUrl = null
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
  }
  lastError = null
  notifyPreviewStop()
}

export type PlayPreviewOptions = {
  /** When true, abort before starting playback (e.g. hover ended while loading). */
  isCancelled?: () => boolean
}

export async function playPreview(
  previewUrl: string,
  options?: PlayPreviewOptions
): Promise<boolean> {
  const isCancelled = (): boolean => options?.isCancelled?.() ?? false

  stopPreview()
  if (isCancelled()) return false

  const audio = ensureAudio()
  let playbackUrl: string
  try {
    playbackUrl = await cachedPlaybackUrl(previewUrl)
  } catch {
    lastError = 'Preview failed to load'
    stopPreview()
    return false
  }
  if (isCancelled()) {
    stopPreview()
    return false
  }
  currentSourceUrl = previewUrl
  audio.src = playbackUrl
  applyCurrentGain(previewUrl)

  try {
    if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup()
          reject(new Error('Preview timed out'))
        }, 8000)

        const onReady = (): void => {
          clearTimeout(timeout)
          cleanup()
          resolve()
        }
        const onError = (): void => {
          clearTimeout(timeout)
          cleanup()
          reject(new Error('Preview failed to load'))
        }
        const cleanup = (): void => {
          audio.removeEventListener('canplay', onReady)
          audio.removeEventListener('error', onError)
        }
        audio.addEventListener('canplay', onReady, { once: true })
        audio.addEventListener('error', onError, { once: true })
        audio.load()
      })
    }

    if (isCancelled()) {
      stopPreview()
      return false
    }

    ensureAnalyser(audio)
    applyCurrentGain(previewUrl)
    await audio.play()
    if (isCancelled()) {
      stopPreview()
      return false
    }
    stopTimer = setTimeout(() => stopPreview(), PREVIEW_DURATION_MS)
    return true
  } catch (err) {
    lastError =
      err instanceof Error ? err.message : 'Could not play preview'
    if (!unlocked) {
      lastError = 'Click Grid to enable audio previews'
    }
    stopPreview()
    return false
  }
}
