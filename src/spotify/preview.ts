const inFlight = new Map<string, Promise<string | null>>()
const gridPrefetched = new Map<string, Promise<string | null>>()

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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await fn(items[index]!)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  )
  return results
}

async function fetchPreviewBatchFromClient(
  trackIds: string[]
): Promise<Record<string, string | null>> {
  const entries = await mapWithConcurrency(trackIds, 8, async (trackId) => {
    const previewUrl = await fetchPreviewFromEmbed(trackId)
    return [trackId, previewUrl] as const
  })
  return Object.fromEntries(entries)
}

async function fetchPreviewBatch(
  trackIds: string[]
): Promise<Record<string, string | null>> {
  if (!trackIds.length) return {}

  try {
    const res = await fetch('/api/preview/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackIds }),
    })
    if (res.ok) {
      const data = (await res.json()) as {
        previews?: Record<string, string | null>
      }
      return data.previews ?? {}
    }
  } catch {
    // fall through to client-side parallel fetch
  }

  return fetchPreviewBatchFromClient(trackIds)
}

/** Backend + embed in parallel — skip the track API hop (usually null anyway). */
async function resolvePreviewUrlParallel(trackId: string): Promise<string | null> {
  const existing = inFlight.get(trackId)
  if (existing) return existing

  const promise = (async () => {
    const [backend, embed] = await Promise.all([
      fetchPreviewFromBackend(trackId),
      fetchPreviewFromEmbed(trackId),
    ])
    return backend ?? embed ?? null
  })().finally(() => {
    inFlight.delete(trackId)
  })

  inFlight.set(trackId, promise)
  return promise
}

async function warmupTrack(
  track: { id: string; preview_url: string | null },
  batchPromise: Promise<Record<string, string | null>>
): Promise<string | null> {
  if (track.preview_url) {
    warmPreviewAudio(track.preview_url)
    return track.preview_url
  }

  const batch = await batchPromise
  const fromBatch = batch[track.id]
  if (fromBatch) {
    warmPreviewAudio(fromBatch)
    return fromBatch
  }

  const url = await resolvePreviewUrlParallel(track.id)
  if (url) warmPreviewAudio(url)
  return url
}

/** Start resolving every track as soon as Grid opens (hover then feels instant). */
export function beginGridPreviewWarmup(
  tracks: { id: string; preview_url: string | null }[]
): void {
  gridPrefetched.clear()

  const needsEmbed = tracks.filter((t) => !t.preview_url).map((t) => t.id)
  const batchPromise = fetchPreviewBatch(needsEmbed)

  for (const track of tracks) {
    gridPrefetched.set(track.id, warmupTrack(track, batchPromise))
  }
}

const warmedUrls = new Set<string>()

export function warmPreviewAudio(previewUrl: string): void {
  if (warmedUrls.has(previewUrl)) return
  warmedUrls.add(previewUrl)

  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'audio'
  link.href = previewUrl
  document.head.appendChild(link)
}

export function clearGridPreviewWarmup(): void {
  gridPrefetched.clear()
  warmedUrls.clear()
}

export async function resolvePreviewUrl(
  trackId: string,
  apiPreviewUrl: string | null | undefined
): Promise<string | null> {
  if (apiPreviewUrl) {
    warmPreviewAudio(apiPreviewUrl)
    return apiPreviewUrl
  }

  const warmed = gridPrefetched.get(trackId)
  if (warmed) return warmed

  const url = await resolvePreviewUrlParallel(trackId)
  if (url) warmPreviewAudio(url)
  return url
}
