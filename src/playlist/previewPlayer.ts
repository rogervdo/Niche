const PREVIEW_DURATION_MS = 20_000

let audioEl: HTMLAudioElement | null = null
let loadedUrl: string | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null
let unlocked = false
let lastError: string | null = null

function ensureAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = document.createElement('audio')
    audioEl.preload = 'auto'
    audioEl.style.display = 'none'
    document.head.appendChild(audioEl)
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

export function stopPreview(): void {
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = null
  }
  if (audioEl) {
    audioEl.pause()
    audioEl.currentTime = 0
  }
  lastError = null
}

function waitForCanPlay(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Preview timed out'))
    }, 5000)

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
  })
}

export async function playPreview(previewUrl: string): Promise<boolean> {
  lastError = null
  const audio = ensureAudio()
  audio.pause()
  audio.currentTime = 0

  try {
    if (loadedUrl !== previewUrl) {
      audio.src = previewUrl
      loadedUrl = previewUrl
      audio.load()
    }

    await waitForCanPlay(audio)
    await audio.play()
    stopTimer = setTimeout(() => stopPreview(), PREVIEW_DURATION_MS)
    return true
  } catch (err) {
    lastError =
      err instanceof Error ? err.message : 'Could not play preview'
    if (!unlocked) {
      lastError = 'Click Grid to enable audio previews'
    }
    audio.pause()
    audio.currentTime = 0
    return false
  }
}
