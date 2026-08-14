export interface EmbedPreviewEntity {
  audioPreview?: { url?: string }
}

/** Pull the 30s preview URL out of the Spotify embed page's `__NEXT_DATA__`. */
export function extractPreviewFromEmbedHtml(html: string): string | null {
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
              entity?: EmbedPreviewEntity
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
