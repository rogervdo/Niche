import type { NextFunction, Request, Response } from 'express'
import { connectDb } from '../db/client.js'

let dbReady: Promise<void> | null = null

function connectOnce(): Promise<void> {
  if (!dbReady) {
    dbReady = connectDb().catch((err) => {
      dbReady = null
      throw err
    })
  }
  return dbReady
}

/** Connect MongoDB on first use (skipped for /health and /preview). */
export async function ensureDb(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await connectOnce()
    next()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(503).json({
      error: 'Database unavailable',
      detail: message,
    })
  }
}
