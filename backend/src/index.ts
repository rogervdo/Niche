import cors from 'cors'
import express, { Router } from 'express'
import { config } from './config.js'
import { connectDb } from './db/client.js'
import { startDailyPlaylistJob } from './jobs/dailyPlaylist.js'
import { ensureDb } from './middleware/ensureDb.js'
import { authRouter } from './routes/auth.js'
import { adminRouter, discoverRouter } from './routes/discover.js'
import { previewRouter } from './routes/preview.js'
import { cacheRouter } from './routes/cache.js'
import { usersRouter } from './routes/users.js'
import { chatRouter } from './routes/chat.js'

const isVercel = Boolean(process.env.VERCEL)

function createApiRouter(): Router {
  const api = Router()

  api.get('/health', (_req, res) => {
    res.json({ ok: true, now: new Date().toISOString() })
  })

  api.use('/preview', previewRouter)
  api.use('/auth', authRouter)
  api.use('/users', ensureDb, usersRouter)
  api.use('/cache', ensureDb, cacheRouter)
  api.use('/discover', ensureDb, discoverRouter)
  api.use('/admin', ensureDb, adminRouter)
  api.use('/chat', chatRouter)

  return api
}

const app = express()

app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
  })
)
// Default 100kb is too small for playlist cache sync (full track entries).
app.use(express.json({ limit: '10mb' }))

// Vercel Services routePrefix `/api` strips that prefix before the request hits Express.
// Local dev: Vite proxies `/api` → backend with the full path, so mount at `/api`.
app.use(isVercel ? '/' : '/api', createApiRouter())

if (!isVercel) {
  async function main(): Promise<void> {
    await connectDb()
    startDailyPlaylistJob()
    const host = process.env.HOST ?? '127.0.0.1'
    app.listen(config.port, host, () => {
      console.log(`Niche API listening on http://${host}:${config.port}`)
    })
  }

  main().catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}

export default app
