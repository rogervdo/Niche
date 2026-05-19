import {
  getPlaylistTrackEntries,
  searchTracks,
  spotifyDelete,
  spotifyFetch,
  spotifyPost,
  spotifyPut,
} from './api'
import type { PlaylistTrackEntry } from './types'
import {
  albumEditionPenalty,
  coreTitleForSearch,
  findBestPopularityMatch,
  isExcludedRecording,
  normalizeAlbumName,
} from './trackMatch'
import { playlistDebug, playlistDebugError, playlistDebugWarn } from './playlistDebug'
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

function findEntryAtPlaylistPosition(
  entries: Awaited<ReturnType<typeof getPlaylistTrackEntries>>,
  playlistPosition: number
) {
  return entries.find((e) => e.position === playlistPosition)
}

async function getPlaylistSnapshotAndTotal(playlistId: string): Promise<{
  snapshot_id: string
  total: number
}> {
  const { snapshot_id, tracks } = await spotifyFetch<{
    snapshot_id: string
    tracks: { total: number }
  }>(`/playlists/${playlistId}?fields=snapshot_id,tracks.total`)
  return { snapshot_id, total: tracks.total }
}

/** Reorder a single playlist row (move or delete depending on insert_before). */
async function reorderPlaylistRange(
  playlistId: string,
  snapshot_id: string,
  rangeStart: number,
  insertBefore: number,
  spotifyTotal: number
): Promise<void> {
  const body = {
    range_start: rangeStart,
    insert_before: insertBefore,
    range_length: 1,
    snapshot_id,
  }
  playlistDebug('reorder → PUT /playlists/.../items', {
    playlistId,
    spotifyTotal,
    ...body,
  })
  const res = await spotifyPut<{ snapshot_id: string }>(
    `/playlists/${playlistId}/items`,
    body
  )
  playlistDebug('reorder ✓', { newSnapshotId: res?.snapshot_id })
}

/**
 * Remove one occurrence at an exact index (legacy /tracks body).
 * Plain DELETE /items by URI alone often returns 200 without removing.
 */
async function deletePlaylistItemAtPosition(
  playlistId: string,
  uri: string,
  playlistPosition: number,
  snapshot_id: string
): Promise<void> {
  playlistDebug('DELETE /tracks with position', {
    uri,
    position: playlistPosition,
    displayNumber: playlistPosition + 1,
  })
  const res = await spotifyDelete<{ snapshot_id?: string }>(
    `/playlists/${playlistId}/tracks`,
    {
      tracks: [{ uri, positions: [playlistPosition] }],
      snapshot_id,
    }
  )
  playlistDebug('DELETE /tracks ✓', { newSnapshotId: res?.snapshot_id })
}

/** Move row inward then reorder-delete (last rows where insert_before >= total). */
async function moveThenReorderDelete(
  playlistId: string,
  playlistPosition: number,
  snapshot_id: string,
  total: number
): Promise<void> {
  const moveTo = Math.max(0, total - 3)
  playlistDebug('remove: move then reorder-delete', {
    playlistPosition,
    moveTo,
    total,
  })
  let snap = snapshot_id
  if (playlistPosition !== moveTo) {
    await reorderPlaylistRange(
      playlistId,
      snap,
      playlistPosition,
      moveTo,
      total
    )
    const fresh = await getPlaylistSnapshotAndTotal(playlistId)
    snap = fresh.snapshot_id
  }
  await reorderPlaylistRange(playlistId, snap, moveTo, moveTo + 2, total)
}

/**
 * Remove one row: DELETE at position (linked_from URI when set), else reorder-delete,
 * else move-then-reorder for tracks at the end of the playlist.
 */
async function removeOnePlaylistRow(
  playlistId: string,
  playlistPosition: number,
  uri: string,
  uriCount: number
): Promise<'delete-at-position' | 'reorder' | 'move-then-reorder'> {
  const { snapshot_id, total } = await getPlaylistSnapshotAndTotal(playlistId)
  const insertBefore = playlistPosition + 2

  try {
    await deletePlaylistItemAtPosition(
      playlistId,
      uri,
      playlistPosition,
      snapshot_id
    )
    return 'delete-at-position'
  } catch (err) {
    playlistDebugWarn('DELETE at position failed, trying reorder', {
      error: err instanceof Error ? err.message : String(err),
      playlistPosition,
      uri,
      uriCount,
    })
  }

  if (insertBefore < total) {
    await reorderPlaylistRange(
      playlistId,
      snapshot_id,
      playlistPosition,
      insertBefore,
      total
    )
    return 'reorder'
  }

  await moveThenReorderDelete(playlistId, playlistPosition, snapshot_id, total)
  return 'move-then-reorder'
}

function assertPlaylistRowRemoved(
  target: PlaylistTrackEntry,
  countBefore: number,
  after: PlaylistTrackEntry[]
): void {
  const stillAtPosition = findEntryAtPlaylistPosition(after, target.position)
  const sameTrackStillThere = stillAtPosition?.track.id === target.track.id
  const stillInPlaylist = after.some((e) => e.track.id === target.track.id)
  const newPositions = stillInPlaylist
    ? after
        .filter((e) => e.track.id === target.track.id)
        .map((e) => e.position + 1)
    : []

  playlistDebug('remove verify', {
    countBefore,
    countAfter: after.length,
    sameTrackStillThere,
    stillInPlaylist,
    newPositions: newPositions.length ? newPositions : null,
    trackAtPositionNow: stillAtPosition?.track.name ?? null,
  })

  if (stillInPlaylist) {
    const moved =
      !sameTrackStillThere && newPositions.length
        ? ` It may have moved to #${newPositions.join(', #')}.`
        : ''
    throw new Error(
      `Spotify did not remove "${target.track.name}" from the playlist.${moved} Try again or remove it in the Spotify app.`
    )
  }

  if (after.length >= countBefore) {
    throw new Error(
      `Spotify did not remove "${target.track.name}" from the playlist. Try again or remove it in the Spotify app.`
    )
  }
}

/**
 * Remove one playlist row by its Spotify playlist position (0-based, counting
 * unavailable rows). Handles duplicate URIs (same track added twice) via
 * reorder so only that row is removed.
 */
/** Removes one row and returns the updated playlist entries (one refetch). */
export async function removePlaylistEntryAtPosition(
  playlistId: string,
  playlistPosition: number,
  market?: string
): Promise<PlaylistTrackEntry[]> {
  playlistDebug('remove: start', { playlistId, playlistPosition, market })

  const entries = await getPlaylistTrackEntries(playlistId, market)
  const target = findEntryAtPlaylistPosition(entries, playlistPosition)

  playlistDebug('remove: loaded entries', {
    playableCount: entries.length,
    requestedPosition: playlistPosition,
    displayNumber: playlistPosition + 1,
    maxStoredPosition: entries.length
      ? Math.max(...entries.map((e) => e.position))
      : null,
    target: target
      ? {
          name: target.track.name,
          id: target.track.id,
          uri: target.uri,
          storedPosition: target.position,
          arrayIndex: entries.indexOf(target),
        }
      : null,
    nearbyPositions: entries
      .filter(
        (e) =>
          e.position >= playlistPosition - 2 &&
          e.position <= playlistPosition + 2
      )
      .map((e) => ({
        position: e.position,
        display: e.position + 1,
        name: e.track.name,
        id: e.track.id,
      })),
  })

  if (!target) {
    playlistDebugWarn('remove: no entry at playlist position', {
      playlistPosition,
      hint: 'Position may have shifted — refresh the playlist',
    })
    throw new Error(
      'This track is no longer at that position in the playlist. Refresh the playlist and try again.'
    )
  }

  const uriCount = entries.filter((e) => e.uri === target.uri).length
  const countBefore = entries.length

  try {
    const method = await removeOnePlaylistRow(
      playlistId,
      playlistPosition,
      target.uri,
      uriCount
    )
    playlistDebug('remove: method used', { method, uriCount, uri: target.uri })
    const after = await getPlaylistTrackEntries(playlistId, market)
    assertPlaylistRowRemoved(target, countBefore, after)
    playlistDebug('remove ✓', {
      name: target.track.name,
      position: playlistPosition,
      countAfter: after.length,
    })
    return after
  } catch (err) {
    playlistDebugError('remove failed', err, {
      playlistPosition,
      track: target.track.name,
    })
    throw err
  }
}

/** Remove one track and insert another at the same playlist index. */
export async function replaceTrackAtPosition(
  playlistId: string,
  playlistPosition: number,
  oldTrackId: string,
  newTrackId: string,
  market?: string
): Promise<void> {
  playlistDebug('replace: start', {
    playlistId,
    playlistPosition,
    displayNumber: playlistPosition + 1,
    oldTrackId,
    newTrackId,
    market,
  })

  const entries = await getPlaylistTrackEntries(playlistId, market)
  const target = findEntryAtPlaylistPosition(entries, playlistPosition)

  playlistDebug('replace: loaded entries', {
    playableCount: entries.length,
    target: target
      ? {
          name: target.track.name,
          id: target.track.id,
          uri: target.uri,
          storedPosition: target.position,
          idMatches: target.track.id === oldTrackId,
        }
      : null,
  })

  if (!target || target.track.id !== oldTrackId) {
    playlistDebugWarn('replace: position/id mismatch', {
      playlistPosition,
      expectedOldTrackId: oldTrackId,
      foundId: target?.track.id ?? null,
      foundName: target?.track.name ?? null,
    })
    throw new Error(
      'This track is no longer at that position in the playlist. Refresh the playlist and try again.'
    )
  }

  const countBefore = entries.length

  const uriCount = entries.filter((e) => e.uri === target.uri).length

  try {
    const method = await removeOnePlaylistRow(
      playlistId,
      playlistPosition,
      target.uri,
      uriCount
    )
    playlistDebug('replace: remove step', { method, countBefore })
    const after = await getPlaylistTrackEntries(playlistId, market)
    assertPlaylistRowRemoved(target, countBefore, after)

    const postBody = {
      uris: [`spotify:track:${newTrackId}`],
      position: playlistPosition,
    }
    playlistDebug('replace → POST', postBody)
    await spotifyPost(`/playlists/${playlistId}/items`, postBody)
    playlistDebug('replace ✓', {
      from: target.track.name,
      position: playlistPosition,
      newTrackId,
    })
  } catch (err) {
    playlistDebugError('replace failed', err, {
      playlistPosition,
      oldTrackId,
      newTrackId,
    })
    throw err
  }
}
