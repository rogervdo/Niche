import {
  classifyPlaylist,
  getAudioFeatures,
  LIKED_SONGS_PLAYLIST_ID,
} from '../spotify/api'
import { getCachedPlaylistEntries } from '../spotify/playlistCache'
import type { AudioFeatures, PlaylistTrackEntry, SpotifyPlaylist } from '../spotify/types'

const MAX_TRACKS_FOR_FEATURES = 100
const TOP_ARTISTS_IN_PLAYLIST = 5

function avg(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function sampleTrackIds(ids: string[]): string[] {
  if (ids.length <= MAX_TRACKS_FOR_FEATURES) return ids
  const step = ids.length / MAX_TRACKS_FOR_FEATURES
  const sampled: string[] = []
  for (let i = 0; i < MAX_TRACKS_FOR_FEATURES; i++) {
    sampled.push(ids[Math.floor(i * step)]!)
  }
  return sampled
}

function moodLabel(
  valence: number,
  danceability: number,
  acousticness: number,
  tempo: number
): string {
  const parts: string[] = []
  if (valence >= 0.55) parts.push('upbeat/happy')
  else if (valence <= 0.35) parts.push('mellow/sad')
  else parts.push('neutral mood')

  if (danceability >= 0.65) parts.push('danceable')
  else if (danceability <= 0.35) parts.push('low energy')

  if (acousticness >= 0.5) parts.push('acoustic-leaning')
  if (tempo >= 125) parts.push('fast tempo')
  else if (tempo <= 95) parts.push('slow tempo')

  return parts.join(', ')
}

function topArtistsInEntries(
  entries: PlaylistTrackEntry[],
  limit: number
): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of entries) {
    for (const a of e.track.artists) {
      counts.set(a.name, (counts.get(a.name) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

export async function summarizePlaylistAudio(
  playlistName: string,
  entries: PlaylistTrackEntry[],
  userId: string
): Promise<string[] | null> {
  const trackIds = entries.map((e) => e.track.id).filter(Boolean)
  if (!trackIds.length) return null

  const sampled = sampleTrackIds(trackIds)
  let features: Map<string, AudioFeatures>
  try {
    features = await getAudioFeatures(sampled, userId)
  } catch {
    return null
  }

  const rows: AudioFeatures[] = []
  for (const id of sampled) {
    const f = features.get(id)
    if (f) rows.push(f)
  }
  if (!rows.length) return null

  const valence = avg(rows.map((f) => f.valence))
  const danceability = avg(rows.map((f) => f.danceability))
  const acousticness = avg(rows.map((f) => f.acousticness))
  const tempo = avg(rows.map((f) => f.tempo))

  const lines: string[] = [
    `Audio profile for "${playlistName}" (${rows.length} tracks analyzed${trackIds.length > rows.length ? `, sampled from ${trackIds.length}` : ''}):`,
    `  avg valence ${valence.toFixed(2)} (0=sad, 1=happy), danceability ${danceability.toFixed(2)}, acousticness ${acousticness.toFixed(2)}, tempo ${Math.round(tempo)} BPM`,
    `  vibe: ${moodLabel(valence, danceability, acousticness, tempo)}`,
  ]

  const topArtists = topArtistsInEntries(entries, TOP_ARTISTS_IN_PLAYLIST)
  if (topArtists.length) {
    lines.push('  most common artists:')
    for (const { name, count } of topArtists) {
      lines.push(`    - ${name} (${count} tracks)`)
    }
  }

  return lines
}

export async function appendPlaylistAudioSummaries(
  lines: string[],
  input: {
    userId: string
    market: string
    playlists: SpotifyPlaylist[]
    activeDetailPlaylistId: string | null
  }
): Promise<void> {
  const summaries: { name: string; entries: PlaylistTrackEntry[]; priority: number }[] = []

  const addIfCached = (playlistId: string, name: string, priority: number) => {
    const entries = getCachedPlaylistEntries(playlistId, input.market)
    if (entries?.length) summaries.push({ name, entries, priority })
  }

  if (input.activeDetailPlaylistId) {
    const pid = input.activeDetailPlaylistId
    const playlist = input.playlists.find((p) => p.id === pid)
    const name =
      pid === LIKED_SONGS_PLAYLIST_ID
        ? 'Liked Songs'
        : (playlist?.name ?? 'Open playlist')
    addIfCached(pid, name, 0)
  }

  const owned = input.playlists
    .filter((p) => classifyPlaylist(p, input.userId) !== 'followed')
    .sort((a, b) => (b.tracks?.total ?? 0) - (a.tracks?.total ?? 0))
    .slice(0, 3)

  for (const p of owned) {
    if (p.id === input.activeDetailPlaylistId) continue
    addIfCached(p.id, p.name, 1)
  }

  summaries.sort((a, b) => a.priority - b.priority)

  const seen = new Set<string>()
  for (const { name, entries } of summaries) {
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const block = await summarizePlaylistAudio(name, entries, input.userId)
    if (block) lines.push(...block)
  }
}
