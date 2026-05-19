/**
 * Parse playlist IDs/URLs and collect artist IDs to hard-exclude from Niche Daily.
 */
import { getPlaylistTrackEntries } from '../spotify/api'

const SPOTIFY_PLAYLIST_ID = /^[a-zA-Z0-9]{22}$/

export function parseExcludePlaylistIds(inputs: string[]): string[] {
  const ids = new Set<string>()
  for (const raw of inputs) {
    const parts = raw.split(/[\s,]+/).filter(Boolean)
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      const urlMatch = trimmed.match(/playlist\/([a-zA-Z0-9]{22})/)
      if (urlMatch?.[1]) {
        ids.add(urlMatch[1])
        continue
      }

      if (SPOTIFY_PLAYLIST_ID.test(trimmed)) {
        ids.add(trimmed)
      }
    }
  }
  return [...ids].slice(0, 10)
}

export async function fetchArtistIdsFromPlaylists(
  playlistIds: string[],
  market?: string
): Promise<Set<string>> {
  const artistIds = new Set<string>()
  for (const playlistId of playlistIds) {
    try {
      const entries = await getPlaylistTrackEntries(playlistId, market)
      for (const entry of entries) {
        for (const artist of entry.track.artists ?? []) {
          if (artist.id) artistIds.add(artist.id)
        }
      }
    } catch {
      // skip invalid or inaccessible playlists
    }
  }
  return artistIds
}
