import 'dotenv/config'

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return undefined
}

function requireEnv(name: string, ...fallbackNames: string[]): string {
  const value = firstEnv(name, ...fallbackNames)
  if (!value) {
    const tried = [name, ...fallbackNames].join(', ')
    throw new Error(
      `Missing required environment variable (tried: ${tried}). See backend/.env.example`
    )
  }
  return value
}

let spotifyConfig: {
  clientId: string
  clientSecret: string
  redirectUri: string
} | null = null

function getSpotifyConfig() {
  if (!spotifyConfig) {
    spotifyConfig = {
      clientId: requireEnv('SPOTIFY_CLIENT_ID', 'VITE_SPOTIFY_CLIENT_ID'),
      clientSecret: requireEnv('SPOTIFY_CLIENT_SECRET'),
      redirectUri:
        firstEnv('SPOTIFY_REDIRECT_URI', 'VITE_REDIRECT_URI') ??
        'http://127.0.0.1:5173/callback',
    }
  }
  return spotifyConfig
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite-preview',
  databaseUrl: process.env.DATABASE_URL ?? 'mongodb://localhost:27017/niche',
  get spotify() {
    return getSpotifyConfig()
  },
  cronSchedule: process.env.CRON_SCHEDULE ?? '0 6 * * *',
  adminClientSecret: process.env.ADMIN_CLIENT_SECRET ?? '',
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173',
}
