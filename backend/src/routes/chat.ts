import { Router } from 'express'
import { config } from '../config.js'
import { getChatModel } from '../config/gemini.js'

export const chatRouter = Router()

type ChatHistoryItem = { role: 'user' | 'model'; text: string }

chatRouter.post('/message', async (req, res) => {
  if (!config.geminiApiKey) {
    res.status(503).json({ error: 'Gemini is not configured (set GEMINI_API_KEY)' })
    return
  }

  const { message, history, context } = req.body as {
    message?: string
    history?: ChatHistoryItem[]
    context?: string
  }

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const contextText =
    typeof context === 'string' && context.trim()
      ? context.trim()
      : 'No library context provided.'

  const prior = Array.isArray(history)
    ? history
        .filter(
          (h): h is ChatHistoryItem =>
            (h?.role === 'user' || h?.role === 'model') &&
            typeof h.text === 'string' &&
            h.text.trim().length > 0
        )
        .slice(-20)
    : []

  const geminiHistory = prior.map((h) => ({
    role: h.role,
    parts: [{ text: h.text }],
  }))

  try {
    const model = getChatModel()
    const chat = model.startChat({ history: geminiHistory })

    const prompt = `Library snapshot:\n${contextText}\n\nUser question:\n${message.trim()}`
    const result = await chat.sendMessage(prompt)
    const reply = result.response.text()

    res.json({ reply })
  } catch (err) {
    console.error('Gemini chat error:', err)
    const msg = err instanceof Error ? err.message : 'Chat request failed'
    res.status(500).json({ error: msg })
  }
})
