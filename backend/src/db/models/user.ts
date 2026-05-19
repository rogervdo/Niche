import mongoose, { Schema, type Document } from 'mongoose'
import { decrypt, encrypt } from '../../lib/crypto.js'
import {
  DEFAULT_OPTIONS,
  mergeOptions,
  type PlaylistOptions,
} from '../../discover/options.js'

export interface IUser {
  userId: string
  refreshToken: string
  playlistId: string | null
  lastUpdated: Date | null
  playlistOptions: PlaylistOptions
  knownArtistIds: string[]
  knownArtistsUpdatedAt: Date | null
}

export interface UserDocument extends IUser, Document {}

const rangeSchema = {
  type: [Number],
  validate: {
    validator: (v: number[]) => v.length === 2,
    message: 'Range must be [min, max]',
  },
}

const userSchema = new Schema<UserDocument>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    refreshToken: { type: String, required: true, unique: true },
    playlistId: { type: String, default: null },
    lastUpdated: { type: Date, default: null },
    knownArtistIds: { type: [String], default: [] },
    knownArtistsUpdatedAt: { type: Date, default: null },
    playlistOptions: {
      anchorArtistIds: {
        type: [String],
        default: DEFAULT_OPTIONS.anchorArtistIds,
      },
      genres: { type: [String], default: DEFAULT_OPTIONS.genres },
      artistPopularity: {
        ...rangeSchema,
        default: DEFAULT_OPTIONS.artistPopularity,
      },
      maxListeners: { type: Number, default: DEFAULT_OPTIONS.maxListeners },
      acousticness: { ...rangeSchema, default: DEFAULT_OPTIONS.acousticness },
      danceability: { ...rangeSchema, default: DEFAULT_OPTIONS.danceability },
      energy: { ...rangeSchema, default: DEFAULT_OPTIONS.energy },
      instrumentalness: {
        ...rangeSchema,
        default: DEFAULT_OPTIONS.instrumentalness,
      },
      popularity: { ...rangeSchema, default: DEFAULT_OPTIONS.popularity },
      valence: { ...rangeSchema, default: DEFAULT_OPTIONS.valence },
    },
  },
  { timestamps: true }
)

userSchema.pre('save', function encryptFields() {
  if (this.isModified('refreshToken')) {
    this.refreshToken = encrypt(this.refreshToken)
  }
})

export function getDecryptedRefreshToken(user: UserDocument): string {
  return decrypt(user.refreshToken)
}

export function toPublicUser(user: UserDocument) {
  return {
    userId: user.userId,
    playlistId: user.playlistId,
    lastUpdated: user.lastUpdated,
    playlistOptions: mergeOptions(user.playlistOptions),
  }
}

export const User = mongoose.model<UserDocument>('User', userSchema)

export async function findUserById(userId: string): Promise<UserDocument | null> {
  return User.findOne({ userId })
}

export async function deleteUserById(userId: string): Promise<void> {
  await User.deleteOne({ userId })
}

export async function upsertUser(
  userId: string,
  refreshToken: string,
  options?: Partial<PlaylistOptions>
): Promise<UserDocument> {
  const existing = await User.findOne({ userId })
  if (existing) {
    existing.refreshToken = refreshToken
    if (options) {
      existing.playlistOptions = mergeOptions({
        ...existing.playlistOptions,
        ...options,
      })
    }
    return existing.save()
  }

  return User.create({
    userId,
    refreshToken,
    playlistOptions: mergeOptions(options),
  })
}
