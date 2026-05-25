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

/** Per-track multiplier (1 = unchanged). Combine with master preview volume. */
export async function measurePreviewGain(blob: Blob): Promise<number> {
  if (blob.size === 0) return 1
  const ctx = new AudioContext()
  try {
    const arrayBuffer = await blob.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    const rms = computeRms(buffer)
    if (rms < 1e-5) return 1
    const gain = TARGET_RMS / rms
    return Math.min(MAX_GAIN, Math.max(MIN_GAIN, gain))
  } catch {
    return 1
  } finally {
    void ctx.close()
  }
}
