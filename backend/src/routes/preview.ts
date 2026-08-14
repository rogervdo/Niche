import { Router } from 'express'
import { extractPreviewFromEmbedHtml } from '../services/embedPreview.js'

export const previewRouter = Router()

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
  return extractPreviewFromEmbedHtml(html)
}

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
