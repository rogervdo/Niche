import { Router } from 'express'

export const previewRouter = Router()

function extractPreviewFromEmbed(html: string): string | null {
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

async function fetchPreviewForTrack(trackId: string): Promise<string | null> {
  const embedRes = await fetch(
    `https://open.spotify.com/embed/track/${trackId}`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Niche/1.0; +https://github.com/rogervdo/Niche)',
        Accept: 'text/html',
      },
    }
  )

  if (!embedRes.ok) return null
  const html = await embedRes.text()
  return extractPreviewFromEmbed(html)
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

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  )
  await Promise.all(workers)
  return results
}

previewRouter.post('/batch', async (req, res) => {
  const { trackIds } = req.body as { trackIds?: string[] }
  if (!Array.isArray(trackIds) || !trackIds.length) {
    res.status(400).json({ error: 'trackIds array is required' })
    return
  }

  const ids = trackIds
    .filter((id) => typeof id === 'string' && /^[a-zA-Z0-9]{22}$/.test(id))
    .slice(0, 100)

  const entries = await mapWithConcurrency(ids, 12, async (trackId) => {
    try {
      const previewUrl = await fetchPreviewForTrack(trackId)
      return [trackId, previewUrl] as const
    } catch {
      return [trackId, null] as const
    }
  })

  res.json({ previews: Object.fromEntries(entries) })
})

previewRouter.get('/:trackId', async (req, res) => {
  const { trackId } = req.params
  if (!/^[a-zA-Z0-9]{22}$/.test(trackId)) {
    res.status(400).json({ error: 'Invalid track ID' })
    return
  }

  try {
    const previewUrl = await fetchPreviewForTrack(trackId)
    if (previewUrl) {
      res.json({ preview_url: previewUrl })
    } else {
      res.status(404).json({ error: 'No preview available' })
    }
  } catch {
    res.status(502).json({ error: 'Failed to resolve preview' })
  }
})
