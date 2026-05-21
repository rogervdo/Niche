import {
  AudioFeaturesCache,
  isCacheFresh,
  TrackMetaCache,
} from '../db/models/playlistCache.js'
import type { PlaylistTrackEntry, SpotifyTrack } from './playlistLibrary.js'
import { spotifyFetch } from './spotify.js'

export type AudioFeatures = {
  id: string
  tempo: number
  valence: number
  danceability: number
  acousticness: number
}

type TracksByIdsResponse = {
  tracks: (SpotifyTrack | null)[]
}

type AudioFeaturesResponse = {
  audio_features: (AudioFeatures | null)[]
}

function trackNeedsEnrichment(track: SpotifyTrack): boolean {
  return track.popularity == null
}

function mergeTrack(base: SpotifyTrack, full: SpotifyTrack): SpotifyTrack {
  return {
    ...base,
    ...full,
    preview_url: full.preview_url ?? base.preview_url ?? null,
    album: {
      ...base.album,
      ...full.album,
      images: full.album.images?.length ? full.album.images : base.album.images,
    },
    artists: full.artists?.length ? full.artists : base.artists,
  }
}

async function fetchTracksByIds(
  accessToken: string,
  trackIds: string[],
  market: string
): Promise<SpotifyTrack[]> {
  const unique = [...new Set(trackIds.filter(Boolean))]
  const out: SpotifyTrack[] = []
  const marketParam = market ? `&market=${encodeURIComponent(market)}` : ''

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50)
    const ids = chunk.map(encodeURIComponent).join(',')
    const res = await spotifyFetch<TracksByIdsResponse>(
      `/tracks?ids=${ids}${marketParam}`,
      accessToken
    )
    for (const t of res.tracks ?? []) {
      if (t?.id) out.push(t)
    }
  }

  return out
}

async function loadCachedTracks(
  userId: string,
  trackIds: string[]
): Promise<Map<string, SpotifyTrack>> {
  const docs = await TrackMetaCache.find({
    userId,
    trackId: { $in: trackIds },
  })
  const map = new Map<string, SpotifyTrack>()
  for (const doc of docs) {
    if (isCacheFresh(doc.fetchedAt)) {
      map.set(doc.trackId, doc.track as SpotifyTrack)
    }
  }
  return map
}

async function saveCachedTracks(
  userId: string,
  tracks: SpotifyTrack[]
): Promise<void> {
  const fetchedAt = new Date()
  await Promise.all(
    tracks.map((track) =>
      TrackMetaCache.findOneAndUpdate(
        { userId, trackId: track.id },
        { userId, trackId: track.id, track, fetchedAt },
        { upsert: true }
      )
    )
  )
}

export async function enrichPlaylistEntries(
  userId: string,
  accessToken: string,
  market: string,
  entries: PlaylistTrackEntry[]
): Promise<PlaylistTrackEntry[]> {
  const needIds = [
    ...new Set(
      entries.filter((e) => trackNeedsEnrichment(e.track)).map((e) => e.track.id)
    ),
  ]

  const allIds = [...new Set(entries.map((e) => e.track.id))]
  const cached = await loadCachedTracks(userId, needIds.length ? needIds : allIds)

  const missing = needIds.filter((id) => !cached.has(id))
  if (missing.length) {
    const fetched = await fetchTracksByIds(accessToken, missing, market)
    await saveCachedTracks(userId, fetched)
    for (const t of fetched) cached.set(t.id, t)
  }

  const enriched = entries.map((entry) => {
    const full = cached.get(entry.track.id)
    return full ? { ...entry, track: mergeTrack(entry.track, full) } : entry
  })

  await saveCachedTracks(
    userId,
    enriched.map((e) => e.track)
  )

  return enriched
}

export async function getCachedAudioFeatures(
  userId: string,
  accessToken: string,
  trackIds: string[]
): Promise<Record<string, AudioFeatures>> {
  const unique = [...new Set(trackIds.filter(Boolean))]
  const out: Record<string, AudioFeatures> = {}

  const docs = await AudioFeaturesCache.find({
    userId,
    trackId: { $in: unique },
  })
  const missing: string[] = []

  for (const id of unique) {
    const doc = docs.find((d) => d.trackId === id)
    if (doc && isCacheFresh(doc.fetchedAt)) {
      out[id] = {
        id,
        tempo: doc.tempo,
        valence: doc.valence,
        danceability: doc.danceability,
        acousticness: doc.acousticness,
      }
    } else {
      missing.push(id)
    }
  }

  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100)
    const ids = chunk.map(encodeURIComponent).join(',')
    const res = await spotifyFetch<AudioFeaturesResponse>(
      `/audio-features?ids=${ids}`,
      accessToken
    )
    const fetchedAt = new Date()
    for (const feat of res.audio_features ?? []) {
      if (!feat?.id) continue
      out[feat.id] = feat
      await AudioFeaturesCache.findOneAndUpdate(
        { userId, trackId: feat.id },
        {
          userId,
          trackId: feat.id,
          tempo: feat.tempo,
          valence: feat.valence,
          danceability: feat.danceability,
          acousticness: feat.acousticness,
          fetchedAt,
        },
        { upsert: true }
      )
    }
  }

  return out
}

export async function clearUserTrackMetaCache(userId: string): Promise<void> {
  await Promise.all([
    TrackMetaCache.deleteMany({ userId }),
    AudioFeaturesCache.deleteMany({ userId }),
  ])
}
