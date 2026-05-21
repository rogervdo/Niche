import { isCacheFresh, LikedTracksCache } from '../db/models/playlistCache.js'
import { spotifyFetch } from './spotify.js'

const SAVED_TRACKS_FIELDS = 'items(track(id)),next'

type SavedTracksPage = {
  items: { track: { id: string } | null }[]
  next: string | null
}

function toApiPath(url: string): string {
  return url.startsWith('http')
    ? url.replace('https://api.spotify.com/v1', '')
    : url
}

async function fetchLikedTrackIdsFromSpotify(accessToken: string): Promise<string[]> {
  const trackIds: string[] = []
  let path: string | null = `/me/tracks?limit=50&fields=${SAVED_TRACKS_FIELDS}`

  while (path) {
    const page: SavedTracksPage = await spotifyFetch<SavedTracksPage>(path, accessToken)
    for (const item of page.items ?? []) {
      if (item.track?.id) trackIds.push(item.track.id)
    }
    path = page.next ? toApiPath(page.next) : null
  }

  return trackIds
}

export async function getCachedLikedTrackIds(
  userId: string,
  accessToken: string,
  force = false
): Promise<{ trackIds: string[]; cached: boolean; fetchedAt: string }> {
  if (!force) {
    const doc = await LikedTracksCache.findOne({ userId })
    if (doc && isCacheFresh(doc.fetchedAt)) {
      return {
        trackIds: doc.trackIds,
        cached: true,
        fetchedAt: doc.fetchedAt.toISOString(),
      }
    }
  }

  const trackIds = await fetchLikedTrackIdsFromSpotify(accessToken)
  const fetchedAt = new Date()

  await LikedTracksCache.findOneAndUpdate(
    { userId },
    { userId, trackIds, fetchedAt },
    { upsert: true, new: true }
  )

  return {
    trackIds,
    cached: false,
    fetchedAt: fetchedAt.toISOString(),
  }
}

export async function addTracksToLikedCache(
  userId: string,
  trackIds: string[]
): Promise<void> {
  if (!trackIds.length) return
  const doc = await LikedTracksCache.findOne({ userId })
  if (!doc) return
  const set = new Set(doc.trackIds)
  for (const id of trackIds) set.add(id)
  doc.trackIds = [...set]
  doc.fetchedAt = new Date()
  await doc.save()
}

export async function removeTracksFromLikedCache(
  userId: string,
  trackIds: string[]
): Promise<void> {
  if (!trackIds.length) return
  const doc = await LikedTracksCache.findOne({ userId })
  if (!doc) return
  const remove = new Set(trackIds)
  doc.trackIds = doc.trackIds.filter((id) => !remove.has(id))
  doc.fetchedAt = new Date()
  await doc.save()
}

export async function clearUserLikedTracksCache(userId: string): Promise<void> {
  await LikedTracksCache.deleteOne({ userId })
}
