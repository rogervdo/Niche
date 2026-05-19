import { searchTracks, spotifyDelete, spotifyFetch, spotifyPost } from './api'
import {
  albumEditionPenalty,
  coreTitleForSearch,
  findBestPopularityMatch,
  isExcludedRecording,
  normalizeAlbumName,
} from './trackMatch'
import type { SpotifyTrack } from './types'

export type ReplaceLookupResult =
  | { status: 'same' }
  | { status: 'none' }
  | { status: 'insufficient_gain'; candidate: SpotifyTrack }
  | { status: 'found'; candidate: SpotifyTrack }

function searchQueriesForTrack(track: SpotifyTrack): string[] {
  const artist = track.artists[0]?.name ?? ''
  const artistQ = artist.replace(/"/g, '')
  const title = track.name.replace(/"/g, '')
  const coreTitle = coreTitleForSearch(track.name).replace(/"/g, '')

  const queries: string[] = []
  // Prefer studio title first when the playlist track is a remix/live variant.
  if (coreTitle && coreTitle !== title) {
    queries.push(`track:"${coreTitle}" artist:"${artistQ}"`)
  }
  queries.push(`track:"${title}" artist:"${artistQ}"`)

  const baseAlbum = normalizeAlbumName(track.album.name)
  if (baseAlbum && (albumEditionPenalty(track.album.name) > 0 || isExcludedRecording(track))) {
    const albumQ = baseAlbum.replace(/"/g, '')
    const searchTitle = coreTitle || title
    queries.push(`track:"${searchTitle}" artist:"${artistQ}" album:"${albumQ}"`)
  }

  return queries
}

async function searchCandidates(
  track: SpotifyTrack,
  market?: string
): Promise<SpotifyTrack[]> {
  const byId = new Map<string, SpotifyTrack>()
  for (const query of searchQueriesForTrack(track)) {
    const hits = await searchTracks(query, market)
    for (const t of hits) byId.set(t.id, t)
  }
  return [...byId.values()]
}

export async function lookupBetterVersion(
  track: SpotifyTrack,
  market?: string
): Promise<ReplaceLookupResult> {
  const candidates = await searchCandidates(track, market)
  const result = findBestPopularityMatch(track, candidates)

  switch (result.status) {
    case 'same':
      return { status: 'same' }
    case 'none':
      return { status: 'none' }
    case 'insufficient_gain':
      return { status: 'insufficient_gain', candidate: result.candidate }
    case 'found':
      return { status: 'found', candidate: result.candidate }
  }
}

/** Remove one track and insert another at the same playlist index. */
export async function replaceTrackAtPosition(
  playlistId: string,
  position: number,
  oldTrackId: string,
  newTrackId: string
): Promise<void> {
  const { snapshot_id } = await spotifyFetch<{ snapshot_id: string }>(
    `/playlists/${playlistId}?fields=snapshot_id`
  )

  await spotifyDelete(`/playlists/${playlistId}/tracks`, {
    tracks: [{ uri: `spotify:track:${oldTrackId}` }],
    snapshot_id,
  })

  await spotifyPost(`/playlists/${playlistId}/tracks`, {
    uris: [`spotify:track:${newTrackId}`],
    position,
  })
}
