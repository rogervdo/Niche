export interface SpotifyUser {
  id: string
  display_name: string | null
  email?: string
  country?: string
  images: { url: string; height: number | null; width: number | null }[] | null
  product?: string
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string | null
  public: boolean | null
  collaborative: boolean
  owner: { id: string; display_name: string | null } | null
  tracks: { total: number }
  images: { url: string; height: number | null; width: number | null }[] | null
  external_urls: { spotify: string }
}

export interface PlaylistsPage {
  items: (SpotifyPlaylist | null)[] | null
  total: number
  limit: number
  offset: number
  next: string | null
}

export interface SpotifyArtist {
  name: string
}

export interface SpotifyAlbum {
  name: string
  release_date?: string
  release_date_precision?: 'year' | 'month' | 'day'
  images: { url: string; width?: number | null; height?: number | null }[] | null
}

export interface SpotifyTrack {
  id: string
  name: string
  duration_ms: number
  preview_url: string | null
  popularity?: number
  uri?: string
  artists: SpotifyArtist[]
  album: SpotifyAlbum
  external_urls: { spotify: string }
}

export interface SearchTracksResponse {
  tracks: {
    items: SpotifyTrack[]
    total: number
  }
}

export interface AudioFeatures {
  id: string
  tempo: number
  valence: number
  danceability: number
  acousticness: number
}

export interface PlaylistTrackItem {
  track: SpotifyTrack | null
}

export interface PlaylistTracksPage {
  items: (PlaylistTrackItem | null)[] | null
  next: string | null
  total: number
}

export interface TokenResponse {
  access_token: string
  token_type: string
  scope: string
  expires_in: number
  refresh_token?: string
}
