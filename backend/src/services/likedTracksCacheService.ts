import {
  cacheDelete,
  cacheGet,
  cachePut,
  isCacheFresh,
} from '../db/models/playlistCache.js'
import { spotifyFetch } from './spotify.js'

const SAVED_TRACKS_FIELDS = 'items(track(id)),next'

const KIND_LIKED = 'liked_tracks'
const KEY = ''

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
    const entry = await cacheGet<string[]>(userId, KIND_LIKED, KEY)
    if (entry && isCacheFresh(entry.fetchedAt)) {
      return {
        trackIds: entry.payload,
        cached: true,
        fetchedAt: entry.fetchedAt.toISOString(),
      }
    }
  }

  const trackIds = await fetchLikedTrackIdsFromSpotify(accessToken)
  const fetchedAt = new Date()

  await cachePut(userId, KIND_LIKED, KEY, trackIds)

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
  const entry = await cacheGet<string[]>(userId, KIND_LIKED, KEY)
  if (!entry) return
  const set = new Set(entry.payload)
  for (const id of trackIds) set.add(id)
  await cachePut(userId, KIND_LIKED, KEY, [...set])
}

export async function removeTracksFromLikedCache(
  userId: string,
  trackIds: string[]
): Promise<void> {
  if (!trackIds.length) return
  const entry = await cacheGet<string[]>(userId, KIND_LIKED, KEY)
  if (!entry) return
  const remove = new Set(trackIds)
  await cachePut(
    userId,
    KIND_LIKED,
    KEY,
    entry.payload.filter((id) => !remove.has(id))
  )
}

export async function clearUserLikedTracksCache(userId: string): Promise<void> {
  await cacheDelete(userId, KIND_LIKED)
}
