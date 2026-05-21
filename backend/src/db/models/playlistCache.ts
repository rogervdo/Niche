import mongoose, { Schema, type Document } from 'mongoose'

export const PLAYLIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export interface PlaylistLibraryCacheDoc extends Document {
  userId: string
  market: string
  playlists: unknown[]
  fetchedAt: Date
}

export interface PlaylistTracksCacheDoc extends Document {
  userId: string
  playlistId: string
  market: string
  entries: unknown[]
  fetchedAt: Date
}

export interface TrackMetaCacheDoc extends Document {
  userId: string
  trackId: string
  track: unknown
  fetchedAt: Date
}

export interface AudioFeaturesCacheDoc extends Document {
  userId: string
  trackId: string
  tempo: number
  valence: number
  danceability: number
  acousticness: number
  fetchedAt: Date
}

export interface LikedTracksCacheDoc extends Document {
  userId: string
  trackIds: string[]
  fetchedAt: Date
}

const playlistLibraryCacheSchema = new Schema<PlaylistLibraryCacheDoc>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    market: { type: String, required: true, default: 'US' },
    playlists: { type: [Schema.Types.Mixed], default: [] },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true }
)

const playlistTracksCacheSchema = new Schema<PlaylistTracksCacheDoc>(
  {
    userId: { type: String, required: true, index: true },
    playlistId: { type: String, required: true, index: true },
    market: { type: String, required: true, default: 'US' },
    entries: { type: [Schema.Types.Mixed], default: [] },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true }
)

playlistTracksCacheSchema.index(
  { userId: 1, playlistId: 1, market: 1 },
  { unique: true }
)

export const PlaylistLibraryCache = mongoose.model<PlaylistLibraryCacheDoc>(
  'PlaylistLibraryCache',
  playlistLibraryCacheSchema
)

export const PlaylistTracksCache = mongoose.model<PlaylistTracksCacheDoc>(
  'PlaylistTracksCache',
  playlistTracksCacheSchema
)

const trackMetaCacheSchema = new Schema<TrackMetaCacheDoc>(
  {
    userId: { type: String, required: true, index: true },
    trackId: { type: String, required: true, index: true },
    track: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true }
)

trackMetaCacheSchema.index({ userId: 1, trackId: 1 }, { unique: true })

const audioFeaturesCacheSchema = new Schema<AudioFeaturesCacheDoc>(
  {
    userId: { type: String, required: true, index: true },
    trackId: { type: String, required: true, index: true },
    tempo: { type: Number, required: true },
    valence: { type: Number, required: true },
    danceability: { type: Number, required: true },
    acousticness: { type: Number, required: true },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true }
)

audioFeaturesCacheSchema.index({ userId: 1, trackId: 1 }, { unique: true })

export const TrackMetaCache = mongoose.model<TrackMetaCacheDoc>(
  'TrackMetaCache',
  trackMetaCacheSchema
)

export const AudioFeaturesCache = mongoose.model<AudioFeaturesCacheDoc>(
  'AudioFeaturesCache',
  audioFeaturesCacheSchema
)

const likedTracksCacheSchema = new Schema<LikedTracksCacheDoc>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    trackIds: { type: [String], default: [] },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true }
)

export const LikedTracksCache = mongoose.model<LikedTracksCacheDoc>(
  'LikedTracksCache',
  likedTracksCacheSchema
)

export function isCacheFresh(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() < PLAYLIST_CACHE_TTL_MS
}
