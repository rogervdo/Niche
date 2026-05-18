export interface SpotifyImage {
  url: string
  width?: number | null
  height?: number | null
}

/** Display sizes (px) — pick closest Spotify CDN variant to avoid loading 640px for a 40px thumb. */
export const IMAGE_SIZES = {
  avatar: 40,
  track: 40,
  card: 300,
  detailCover: 180,
} as const

/** Smallest image with width >= target, else largest available. */
export function pickImageUrl(
  images: SpotifyImage[] | null | undefined,
  targetWidth: number
): string {
  if (!images?.length) return ''

  const withUrl = images.filter((img) => img.url)
  if (!withUrl.length) return ''

  const sized = withUrl.filter((img) => img.width != null && img.width > 0)
  if (!sized.length) {
    // Spotify usually lists largest first — use last entry when dimensions are missing.
    return withUrl[withUrl.length - 1]!.url
  }

  sized.sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  const match = sized.find((img) => (img.width ?? 0) >= targetWidth)
  return (match ?? sized[sized.length - 1]!).url
}

export function buildSrcSet(
  images: SpotifyImage[] | null | undefined
): string {
  if (!images?.length) return ''

  const parts = images
    .filter((img) => img.url && img.width != null && img.width > 0)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
    .map((img) => `${img.url} ${img.width}w`)

  return parts.join(', ')
}

export interface RenderImgOptions {
  images: SpotifyImage[] | null | undefined
  targetWidth: number
  width: number
  height: number
  alt?: string
  className?: string
  loading?: 'lazy' | 'eager'
  fetchPriority?: 'high' | 'low' | 'auto'
  sizes?: string
}

/** Optimized <img> with right-sized src, optional srcset, lazy load, and layout dimensions. */
export function renderImg(opts: RenderImgOptions): string {
  const src = pickImageUrl(opts.images, opts.targetWidth)
  if (!src) return ''

  const srcset = buildSrcSet(opts.images)
  const alt = escapeAttr(opts.alt ?? '')
  const cls = opts.className ? ` class="${escapeAttr(opts.className)}"` : ''
  const loading = opts.loading ?? 'lazy'
  const fetchPriority =
    opts.fetchPriority && opts.fetchPriority !== 'auto'
      ? ` fetchpriority="${opts.fetchPriority}"`
      : ''
  const sizes = srcset && opts.sizes ? ` sizes="${escapeAttr(opts.sizes)}"` : ''
  const srcsetAttr = srcset ? ` srcset="${escapeAttr(srcset)}"` : ''

  return `<img${cls} src="${escapeAttr(src)}"${srcsetAttr}${sizes} alt="${alt}" width="${opts.width}" height="${opts.height}" loading="${loading}" decoding="async"${fetchPriority} />`
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}
