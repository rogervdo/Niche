import { GoogleGenerativeAI } from '@google/generative-ai'
import { config } from '../config.js'
import { CHAT_SYSTEM_PROMPT } from './chatPrompt.js'

const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview'

let genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.geminiApiKey)
  }
  return genAI
}

export function getChatModel() {
  const modelName = config.geminiModel ?? DEFAULT_MODEL
  return getGenAI().getGenerativeModel({
    model: modelName,
    systemInstruction: CHAT_SYSTEM_PROMPT,
  })
}
