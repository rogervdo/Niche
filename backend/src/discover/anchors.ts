const SPOTIFY_ARTIST_ID = /^[a-zA-Z0-9]{22}$/

/** Parse Spotify artist IDs from raw IDs, URLs, or open.spotify.com links. */
export function parseAnchorArtistIds(inputs: string[]): string[] {
  const ids = new Set<string>()
  for (const raw of inputs) {
    const parts = raw.split(/[\s,]+/).filter(Boolean)
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      const urlMatch = trimmed.match(/artist\/([a-zA-Z0-9]{22})/)
      if (urlMatch?.[1]) {
        ids.add(urlMatch[1])
        continue
      }

      if (SPOTIFY_ARTIST_ID.test(trimmed)) {
        ids.add(trimmed)
      }
    }
  }
  return [...ids].slice(0, 5)
}
