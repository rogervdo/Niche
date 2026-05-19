const PREVIEW_DURATION_MS = 20_000

const audioBlobUrlBySource = new Map<string, string>()
const audioFetchInFlight = new Map<string, Promise<string>>()

let audioEl: HTMLAudioElement | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null
let unlocked = false
let lastError: string | null = null

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = document.createElement('audio')
    audioEl.preload = 'auto'
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
    return objectUrl
  })().finally(() => {
    audioFetchInFlight.delete(previewUrl)
  })

  audioFetchInFlight.set(previewUrl, promise)
  return promise
}

export function stopPreview(): void {
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = null
  }
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
  }
  lastError = null
}

export async function playPreview(previewUrl: string): Promise<boolean> {
  stopPreview()
  const audio = ensureAudio()
  let playbackUrl: string
  try {
    playbackUrl = await cachedPlaybackUrl(previewUrl)
  } catch {
    lastError = 'Preview failed to load'
    stopPreview()
    return false
  }
  audio.src = playbackUrl

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

    await audio.play()
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
