import { markTracksLikedInCache, spotifyPost, spotifyPut } from '../spotify/api'
import type { SpotifyPlaylist } from '../spotify/types'

const BATCH_SIZE = 100
const LIKED_BATCH_SIZE = 50

export async function createUserPlaylist(
  userId: string,
  name: string,
  options?: { public?: boolean; description?: string }
): Promise<SpotifyPlaylist> {
  return spotifyPost<SpotifyPlaylist>(`/users/${userId}/playlists`, {
    name,
    public: options?.public ?? false,
    description: options?.description ?? '',
  })
}

/** Append track URIs to the end of a playlist (batched). */
export async function appendTracksToPlaylist(
  playlistId: string,
  uris: string[]
): Promise<void> {
  for (let i = 0; i < uris.length; i += BATCH_SIZE) {
    const chunk = uris.slice(i, i + BATCH_SIZE)
    await spotifyPost(`/playlists/${playlistId}/items`, { uris: chunk })
  }
}

/** Save tracks to the user's Liked Songs library (batched). */
export async function saveTracksToLiked(
  trackIds: string[],
  userId?: string
): Promise<void> {
  for (let i = 0; i < trackIds.length; i += LIKED_BATCH_SIZE) {
    const chunk = trackIds.slice(i, i + LIKED_BATCH_SIZE)
    await spotifyPut('/me/tracks', { ids: chunk })
  }
  await markTracksLikedInCache(trackIds, userId)
}
