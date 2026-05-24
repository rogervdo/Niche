import { getCartTracks } from '../cart/cart'
import { classifyPlaylist, LIKED_SONGS_PLAYLIST_ID } from '../spotify/api'
import { getCachedPlaylistEntries } from '../spotify/playlistCache'
import type { SpotifyPlaylist } from '../spotify/types'

const TRACK_SAMPLE = 25

export type ChatContextInput = {
  userId: string
  displayName: string
  market: string
  view: 'dashboard' | 'discover' | 'detail'
  playlists: SpotifyPlaylist[]
  activeDetailPlaylistId: string | null
  likedSongsTotal: number | null
}

export function buildLibraryContext(input: ChatContextInput): string {
  const lines: string[] = []
  lines.push(`User: ${input.displayName || 'Unknown'}`)
  lines.push(`Screen: ${input.view}`)

  const yours = input.playlists.filter((p) => classifyPlaylist(p, input.userId) === 'yours')
  const collab = input.playlists.filter(
    (p) => classifyPlaylist(p, input.userId) === 'collaborative'
  )
  const followed = input.playlists.filter(
    (p) => classifyPlaylist(p, input.userId) === 'followed'
  )

  lines.push(
    `Library: ${input.playlists.length} playlists (${yours.length} yours, ${collab.length} collaborative, ${followed.length} followed)`
  )
  if (input.likedSongsTotal != null) {
    lines.push(`Liked Songs: ${input.likedSongsTotal} tracks`)
  }

  const topPlaylists = [...input.playlists]
    .sort((a, b) => (b.tracks?.total ?? 0) - (a.tracks?.total ?? 0))
    .slice(0, 15)

  if (topPlaylists.length) {
    lines.push('Largest playlists:')
    for (const p of topPlaylists) {
      const kind = classifyPlaylist(p, input.userId)
      lines.push(`  - "${p.name}" (${p.tracks?.total ?? '?'} tracks, ${kind})`)
    }
  }

  if (input.view === 'detail' && input.activeDetailPlaylistId) {
    const pid = input.activeDetailPlaylistId
    const playlist =
      pid === LIKED_SONGS_PLAYLIST_ID
        ? null
        : input.playlists.find((p) => p.id === pid) ?? null
    const name =
      pid === LIKED_SONGS_PLAYLIST_ID
        ? 'Liked Songs'
        : (playlist?.name ?? 'Unknown playlist')

    const entries = getCachedPlaylistEntries(pid, input.market)
    lines.push(`Open playlist: "${name}" (${entries?.length ?? '?'} tracks loaded)`)

    if (entries?.length) {
      lines.push('Tracks in view (sample):')
      for (const e of entries.slice(0, TRACK_SAMPLE)) {
        const t = e.track
        if (!t) continue
        const artists = t.artists.map((a) => a.name).join(', ')
        lines.push(`  - ${t.name} — ${artists}`)
      }
      if (entries.length > TRACK_SAMPLE) {
        lines.push(`  … and ${entries.length - TRACK_SAMPLE} more`)
      }
    }
  }

  const cart = getCartTracks()
  if (cart.length) {
    lines.push(`Cart (${cart.length} tracks):`)
    for (const t of cart.slice(0, 12)) {
      const artists = t.artists.map((a) => a.name).join(', ')
      lines.push(`  - ${t.name} — ${artists}`)
    }
    if (cart.length > 12) lines.push(`  … and ${cart.length - 12} more`)
  }

  return lines.join('\n')
}
