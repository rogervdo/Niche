const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export type ChatHistoryItem = { role: 'user' | 'model'; text: string }

export async function sendChatMessage(
  message: string,
  context: string,
  history: ChatHistoryItem[]
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, history }),
  })

  const data = (await res.json().catch(() => ({}))) as {
    reply?: string
    error?: string
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Chat error (${res.status})`)
  }

  if (!data.reply) {
    throw new Error('Empty reply from Nichebot')
  }

  return data.reply
}
