import { classifyPlaylist } from '../spotify/api'
import type { SpotifyPlaylist } from '../spotify/types'

/** Playlists you own (not collaborative, not followed). */
export function isOwnPlaylist(playlist: SpotifyPlaylist, userId: string): boolean {
  return classifyPlaylist(playlist, userId) === 'yours'
}

export function filterOwnPlaylists(
  playlists: SpotifyPlaylist[],
  userId: string,
  archivedPlaylistIds: ReadonlySet<string> = new Set()
): SpotifyPlaylist[] {
  return playlists.filter((p) => {
    if (archivedPlaylistIds.has(p.id)) return false
    return isOwnPlaylist(p, userId)
  })
}
