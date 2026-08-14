/** Target RMS for 30s previews (~−19 dBFS); tames hot masters without over-boosting quiet clips. */
const TARGET_RMS = 0.11
const MIN_GAIN = 0.4
const MAX_GAIN = 1.75

function computeRms(buffer: AudioBuffer): number {
  let sumSq = 0
  let count = 0
  const stride = buffer.length > 44100 * 12 ? 4 : 1
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < buffer.length; i += stride) {
      const s = data[i] ?? 0
      sumSq += s * s
      count++
    }
  }
  return count > 0 ? Math.sqrt(sumSq / count) : 0
}

let decodeContext: AudioContext | null = null
const gainCache = new Map<string, number>()

function ensureDecodeContext(): AudioContext {
  if (!decodeContext) decodeContext = new AudioContext()
  return decodeContext
}

/**
 * Per-track multiplier (1 = unchanged). Combine with master preview volume.
 * `cacheKey` (the preview URL) memoizes the result so each track is decoded
 * only once per session.
 */
export async function measurePreviewGain(
  blob: Blob,
  cacheKey?: string
): Promise<number> {
  if (cacheKey) {
    const cached = gainCache.get(cacheKey)
    if (cached !== undefined) return cached
  }
  if (blob.size === 0) return 1

  try {
    const arrayBuffer = await blob.arrayBuffer()
    const buffer = await ensureDecodeContext().decodeAudioData(arrayBuffer)
    const rms = computeRms(buffer)
    const gain =
      rms < 1e-5
        ? 1
        : Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_RMS / rms))
    if (cacheKey) gainCache.set(cacheKey, gain)
    return gain
  } catch {
    return 1
  }
}
