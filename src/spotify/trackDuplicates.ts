import {
  albumEditionPenalty,
  isLiveRecording,
  isRemixRecording,
  normalizeTrackTitle,
} from './trackMatch'
import type { PlaylistTrackEntry, SpotifyTrack } from './types'

export type DuplicateGroup = {
  key: string
  normalizedTitle: string
  artist: string
  entries: PlaylistTrackEntry[]
  /** @deprecated Use entries — kept for callers that only need tracks. */
  tracks: SpotifyTrack[]
}

function primaryArtistKey(track: SpotifyTrack): string {
  return track.artists[0]?.name?.trim().toLowerCase() ?? ''
}

function duplicateKey(track: SpotifyTrack): string | null {
  const artist = primaryArtistKey(track)
  const title = normalizeTrackTitle(track.name)
  if (!artist || !title) return null
  return `${artist}\0${title}`
}

/** Human-readable variant tags for duplicate group members. */
export function getVariantLabels(track: SpotifyTrack): string[] {
  const labels: string[] = []
  const title = track.name
  const album = track.album.name

  if (isRemixRecording(track)) labels.push('Remix')
  if (isLiveRecording(track)) labels.push('Live')
  if (albumEditionPenalty(album) >= 45 || /\b(deluxe|super deluxe)\b/i.test(title)) {
    labels.push('Deluxe')
  }
  if (/\bremaster(ed)?\b/i.test(title) || /\bremaster(ed)?\b/i.test(album)) {
    labels.push('Remastered')
  }
  if (/\bacoustic\b/i.test(title) || /\bacoustic\b/i.test(album)) labels.push('Acoustic')
  if (/\bradio edit\b/i.test(title)) labels.push('Radio edit')
  if (/\binstrumental\b/i.test(title)) labels.push('Instrumental')
  if (/\bextended\b/i.test(title)) labels.push('Extended')
  if (/\banniversary\b/i.test(album)) labels.push('Anniversary edition')

  return labels.length ? labels : ['Standard']
}

/**
 * Group playlist tracks that are the same song under different cuts
 * (remix, deluxe, live, remastered, etc.).
 */
export function findDuplicateGroups(
  entries: PlaylistTrackEntry[]
): DuplicateGroup[] {
  const map = new Map<string, PlaylistTrackEntry[]>()

  for (const entry of entries) {
    const key = duplicateKey(entry.track)
    if (!key) continue
    const group = map.get(key)
    if (group) group.push(entry)
    else map.set(key, [entry])
  }

  const groups: DuplicateGroup[] = []
  for (const [key, groupEntries] of map) {
    if (groupEntries.length < 2) continue
    const first = groupEntries[0]!.track
    groups.push({
      key,
      normalizedTitle: normalizeTrackTitle(first.name),
      artist: first.artists[0]?.name ?? '',
      entries: groupEntries,
      tracks: groupEntries.map((e) => e.track),
    })
  }

  groups.sort((a, b) => {
    if (b.entries.length !== a.entries.length) {
      return b.entries.length - a.entries.length
    }
    return a.normalizedTitle.localeCompare(b.normalizedTitle, undefined, {
      sensitivity: 'base',
    })
  })

  return groups
}

export function duplicateTrackIds(groups: DuplicateGroup[]): Set<string> {
  const ids = new Set<string>()
  for (const group of groups) {
    for (const entry of group.entries) ids.add(entry.track.id)
  }
  return ids
}
