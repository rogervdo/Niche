import {
  getCachedPreviewUrl,
  setCachedPreviewUrl,
} from './trackMetaCache'
import { extractPreviewFromEmbedHtml } from '../../backend/src/services/embedPreview'
import { BoundedMap } from '../util/boundedMap'

const RESOLVED_CACHE_MAX = 200

const resolvedCache = new BoundedMap<string, string | null>(RESOLVED_CACHE_MAX)
const inFlight = new Map<string, Promise<string | null>>()

/** Backend is authoritative; returns null only for a definitive 404. */
async function fetchPreviewFromBackend(trackId: string): Promise<string | null> {
  const res = await fetch(`/api/preview/${encodeURIComponent(trackId)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Preview backend unavailable')
  const data = (await res.json()) as { preview_url?: string }
  return data.preview_url ?? null
}

async function fetchPreviewFromEmbed(trackId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/spotify-embed/track/${encodeURIComponent(trackId)}`,
      { credentials: 'omit' }
    )
    if (!res.ok) return null
    const html = await res.text()
    return extractPreviewFromEmbedHtml(html)
  } catch {
    return null
  }
}

async function resolvePreviewUrlParallel(trackId: string): Promise<string | null> {
  const persisted = getCachedPreviewUrl(trackId)
  if (persisted !== undefined) {
    resolvedCache.set(trackId, persisted)
    return persisted
  }

  const existing = inFlight.get(trackId)
  if (existing) return existing

  const promise = (async () => {
    let url: string | null
    try {
      url = await fetchPreviewFromBackend(trackId)
    } catch {
      url = await fetchPreviewFromEmbed(trackId)
    }
    resolvedCache.set(trackId, url)
    setCachedPreviewUrl(trackId, url)
    return url
  })().finally(() => {
    inFlight.delete(trackId)
  })

  inFlight.set(trackId, promise)
  return promise
}

/** Resolve on hover — backend first, embed fallback; cached per track (incl. misses). */
export async function resolvePreviewUrl(
  trackId: string,
  apiPreviewUrl: string | null | undefined
): Promise<string | null> {
  const cached = resolvedCache.get(trackId)
  if (cached !== undefined) return cached

  if (apiPreviewUrl) {
    resolvedCache.set(trackId, apiPreviewUrl)
    setCachedPreviewUrl(trackId, apiPreviewUrl)
    return apiPreviewUrl
  }
  return resolvePreviewUrlParallel(trackId)
}
