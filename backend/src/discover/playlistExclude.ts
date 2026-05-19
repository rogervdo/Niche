/**
 * Parse playlist IDs/URLs and collect artist IDs to hard-exclude from Niche Daily.
 */
import { spotifyFetch } from '../services/spotify.js'

const SPOTIFY_PLAYLIST_ID = /^[a-zA-Z0-9]{22}$/

const PLAYLIST_TRACKS_FIELDS = 'items(track(artists(id))),next'

type PlaylistTracksPage = {
  items: { track: { artists: { id: string }[] } | null }[]
  next: string | null
}

function toApiPath(url: string): string {
  return url.startsWith('http')
    ? url.replace('https://api.spotify.com/v1', '')
    : url
}

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
  accessToken: string,
  market = 'US'
): Promise<Set<string>> {
  const artistIds = new Set<string>()
  const marketParam = market ? `&market=${encodeURIComponent(market)}` : ''

  for (const playlistId of playlistIds) {
    try {
      let url: string | null =
        `/playlists/${playlistId}/tracks?limit=50&fields=${PLAYLIST_TRACKS_FIELDS}${marketParam}`
      while (url) {
        const path = toApiPath(url)
        const page = await spotifyFetch<PlaylistTracksPage>(path, accessToken)
        for (const item of page.items ?? []) {
          for (const artist of item.track?.artists ?? []) {
            if (artist.id) artistIds.add(artist.id)
          }
        }
        url = page.next ? toApiPath(page.next) : null
      }
    } catch {
      // skip invalid or inaccessible playlists
    }
  }
  return artistIds
}
