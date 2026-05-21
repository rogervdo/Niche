import {
  getCachedPreviewUrl,
  setCachedPreviewUrl,
} from './trackMetaCache'

const resolvedCache = new Map<string, string | null>()
const inFlight = new Map<string, Promise<string | null>>()

function extractPreviewFromEmbedHtml(html: string): string | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  )
  if (!match?.[1]) return null

  try {
    const json = JSON.parse(match[1]) as {
      props?: {
        pageProps?: {
          state?: {
            data?: {
              entity?: { audioPreview?: { url?: string } }
            }
          }
        }
      }
    }
    return json.props?.pageProps?.state?.data?.entity?.audioPreview?.url ?? null
  } catch {
    return null
  }
}

async function fetchPreviewFromBackend(trackId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/preview/${encodeURIComponent(trackId)}`)
    if (!res.ok) return null
    const data = (await res.json()) as { preview_url?: string }
    return data.preview_url ?? null
  } catch {
    return null
  }
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

  const cached = resolvedCache.get(trackId)
  if (cached !== undefined) return cached

  const existing = inFlight.get(trackId)
  if (existing) return existing

  const promise = (async () => {
    const [backend, embed] = await Promise.all([
      fetchPreviewFromBackend(trackId),
      fetchPreviewFromEmbed(trackId),
    ])
    const url = backend ?? embed ?? null
    resolvedCache.set(trackId, url)
    setCachedPreviewUrl(trackId, url)
    return url
  })().finally(() => {
    inFlight.delete(trackId)
  })

  inFlight.set(trackId, promise)
  return promise
}

/** Resolve on hover — backend + embed in parallel; cached per track for the session. */
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
