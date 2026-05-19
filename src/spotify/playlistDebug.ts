const PREFIX = '[Niche playlist]'

/**
 * Playlist edit debug logs (remove / replace / duplicates).
 * Off by default. Enable: localStorage.setItem('niche:debug-playlist', '1') then reload.
 */
export function isPlaylistDebugEnabled(): boolean {
  try {
    return localStorage.getItem('niche:debug-playlist') === '1'
  } catch {
    return false
  }
}

export function playlistDebug(
  step: string,
  data?: Record<string, unknown>
): void {
  if (!isPlaylistDebugEnabled()) return
  if (data !== undefined) {
    console.log(PREFIX, step, data)
  } else {
    console.log(PREFIX, step)
  }
}

export function playlistDebugWarn(
  step: string,
  data?: Record<string, unknown>
): void {
  if (!isPlaylistDebugEnabled()) return
  if (data !== undefined) {
    console.warn(PREFIX, step, data)
  } else {
    console.warn(PREFIX, step)
  }
}

export function playlistDebugError(
  step: string,
  err: unknown,
  data?: Record<string, unknown>
): void {
  if (!isPlaylistDebugEnabled()) return
  console.error(PREFIX, step, { ...data, error: err })
}
