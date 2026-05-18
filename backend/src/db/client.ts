import mongoose from 'mongoose'
import { config } from '../config.js'

export async function connectDb(): Promise<void> {
  try {
    await mongoose.connect(config.databaseUrl, { serverSelectionTimeoutMS: 5000 })
  } catch (err) {
    const hint =
      'Is MongoDB running? From the repo root: npm run db:up (Docker) or brew services start mongodb-community'
    throw new Error(`${hint}\n${err instanceof Error ? err.message : String(err)}`, { cause: err })
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}
