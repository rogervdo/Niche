import { sendChatMessage, type ChatHistoryItem } from './client'
import { buildLibraryContext, type ChatContextInput } from './context'
import { clearTasteProfileCache } from './tasteProfile'
import { renderChatMarkdown } from './markdown'
import { prefetchTasteProfile } from './tasteProfile'

const CHAT_SIZE_KEY = 'niche_chat_size'
const DEFAULT_SIZE = { width: 352, height: 416 }
const MIN_SIZE = { width: 280, height: 280 }

type ChatSize = { width: number; height: number }

function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

function clampChatSize(size: ChatSize): ChatSize {
  const margin = 48
  const maxW = Math.max(MIN_SIZE.width, window.innerWidth - margin)
  const maxH = Math.max(MIN_SIZE.height, window.innerHeight - margin)
  return {
    width: Math.min(maxW, Math.max(MIN_SIZE.width, Math.round(size.width))),
    height: Math.min(maxH, Math.max(MIN_SIZE.height, Math.round(size.height))),
  }
}

function loadChatSize(): ChatSize {
  try {
    const raw = localStorage.getItem(CHAT_SIZE_KEY)
    if (!raw) return { ...DEFAULT_SIZE }
    const parsed = JSON.parse(raw) as ChatSize
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
      return clampChatSize(parsed)
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SIZE }
}

function saveChatSize(size: ChatSize): void {
  try {
    localStorage.setItem(CHAT_SIZE_KEY, JSON.stringify(size))
  } catch {
    /* quota or private mode */
  }
}

function applyPanelSize(panel: HTMLElement, size: ChatSize): void {
  panel.style.width = `${size.width}px`
  panel.style.height = `${size.height}px`
}

export type ChatUiContext = {
  getContextInput: () => ChatContextInput
}

let ctx: ChatUiContext | null = null
let rootEl: HTMLElement | null = null
let open = false
let sending = false
let panelSize = loadChatSize()
const messages: ChatHistoryItem[] = []

function onWindowResize(): void {
  if (!open) return
  const panel = rootEl?.querySelector<HTMLElement>('.chat-panel')
  if (!panel) return
  const clamped = clampChatSize(panelSize)
  if (clamped.width !== panelSize.width || clamped.height !== panelSize.height) {
    panelSize = clamped
    saveChatSize(panelSize)
    applyPanelSize(panel, panelSize)
  }
}

function renderMessages(container: HTMLElement): void {
  if (!messages.length) {
    container.innerHTML = `<p class="chat-empty">Ask Nichebot about your playlists, tracks, or cart.</p>`
    return
  }

  container.innerHTML = messages
    .map((m) => {
      const role = m.role === 'user' ? 'user' : 'assistant'
      const body =
        m.role === 'model' ? renderChatMarkdown(m.text) : escapeHtml(m.text)
      return `<div class="chat-msg chat-msg--${role}">${body}</div>`
    })
    .join('')
  container.scrollTop = container.scrollHeight
}

function bindResize(panel: HTMLElement, handle: HTMLElement): void {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    handle.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY
    const startW = panelSize.width
    const startH = panelSize.height

    const onMove = (ev: PointerEvent) => {
      panelSize = clampChatSize({
        width: startW - (ev.clientX - startX),
        height: startH - (ev.clientY - startY),
      })
      applyPanelSize(panel, panelSize)
    }

    const onUp = () => {
      handle.releasePointerCapture(e.pointerId)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      saveChatSize(panelSize)
    }

    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  })
}

function renderPanel(): void {
  if (!rootEl) return

  if (!open) {
    rootEl.className = 'chat-widget chat-widget--closed'
    rootEl.innerHTML = `
      <button type="button" class="chat-fab" id="chat-fab" aria-label="Open Nichebot" title="Ask Nichebot about your library">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    `
    rootEl.querySelector('#chat-fab')!.addEventListener('click', () => {
      open = true
      panelSize = clampChatSize(panelSize)
      renderPanel()
    })
    return
  }

  rootEl.className = 'chat-widget chat-widget--open'
  rootEl.innerHTML = `
    <div class="chat-panel" role="dialog" aria-label="Nichebot">
      <div class="chat-resize-handle" id="chat-resize" title="Drag to resize" aria-hidden="true"></div>
      <header class="chat-header">
        <span class="chat-title">Nichebot</span>
        <button type="button" class="chat-close" id="chat-close" aria-label="Close">×</button>
      </header>
      <div class="chat-messages" id="chat-messages"></div>
      <form class="chat-form" id="chat-form">
        <textarea
          id="chat-input"
          class="chat-input"
          rows="2"
          placeholder="Message Nichebot…"
          ${sending ? 'disabled' : ''}
        ></textarea>
        <button type="submit" class="chat-send" ${sending ? 'disabled' : ''}>Send</button>
      </form>
      <p class="chat-error" id="chat-error" hidden></p>
    </div>
  `

  const panel = rootEl.querySelector<HTMLElement>('.chat-panel')!
  applyPanelSize(panel, panelSize)
  bindResize(panel, rootEl.querySelector('#chat-resize')!)

  const messagesEl = rootEl.querySelector<HTMLElement>('#chat-messages')!
  renderMessages(messagesEl)

  rootEl.querySelector('#chat-close')!.addEventListener('click', () => {
    open = false
    renderPanel()
  })

  const form = rootEl.querySelector<HTMLFormElement>('#chat-form')!
  const input = rootEl.querySelector<HTMLTextAreaElement>('#chat-input')!
  const errorEl = rootEl.querySelector<HTMLElement>('#chat-error')!

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    void submitMessage(input, errorEl, messagesEl)
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      form.requestSubmit()
    }
  })

  input.focus()
}

async function submitMessage(
  input: HTMLTextAreaElement,
  errorEl: HTMLElement,
  messagesEl: HTMLElement
): Promise<void> {
  const text = input.value.trim()
  if (!text || sending || !ctx) return

  sending = true
  errorEl.hidden = true
  const sendBtn = rootEl?.querySelector<HTMLButtonElement>('.chat-send')
  input.value = ''
  input.disabled = true
  sendBtn?.setAttribute('disabled', '')

  messages.push({ role: 'user', text })
  renderMessages(messagesEl)

  try {
    const context = await buildLibraryContext(ctx.getContextInput())
    const history = messages.slice(0, -1)
    const reply = await sendChatMessage(text, context, history)
    messages.push({ role: 'model', text: reply })
    renderMessages(messagesEl)
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : 'Something went wrong'
    errorEl.hidden = false
  } finally {
    sending = false
    input.disabled = false
    sendBtn?.removeAttribute('disabled')
    input.focus()
  }
}

export function mountChatUI(context: ChatUiContext): void {
  ctx = context
  panelSize = loadChatSize()
  rootEl?.remove()
  rootEl = document.createElement('div')
  rootEl.id = 'niche-chat-widget'
  document.body.appendChild(rootEl)
  window.addEventListener('resize', onWindowResize)
  prefetchTasteProfile()
  renderPanel()
}

export function unmountChatUI(): void {
  window.removeEventListener('resize', onWindowResize)
  clearTasteProfileCache()
  rootEl?.remove()
  rootEl = null
  ctx = null
  open = false
  sending = false
  messages.length = 0
}
