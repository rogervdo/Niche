function escapeHtml(text: string): string {
  const el = document.createElement('div')
  el.textContent = text
  return el.innerHTML
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`\n]+?)`/g, '<code>$1</code>')
}

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    const ul = line.match(/^\s*[-*]\s+(.+)$/)
    const ol = line.match(/^\s*\d+\.\s+(.+)$/)

    if (ul) {
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i]!.match(/^\s*[-*]\s+(.+)$/)
        if (!m) break
        items.push(m[1]!)
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (ol) {
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i]!.match(/^\s*\d+\.\s+(.+)$/)
        if (!m) break
        items.push(m[1]!)
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i]!.trim()) {
      const next = lines[i]!
      if (/^\s*[-*]\s+/.test(next) || /^\s*\d+\.\s+/.test(next)) break
      para.push(next)
      i++
    }
    blocks.push({ type: 'p', lines: para })
  }

  return blocks
}

function renderBlock(block: Block): string {
  if (block.type === 'ul') {
    const items = block.items.map((item) => `<li>${inlineFormat(escapeHtml(item))}</li>`).join('')
    return `<ul>${items}</ul>`
  }
  if (block.type === 'ol') {
    const items = block.items.map((item) => `<li>${inlineFormat(escapeHtml(item))}</li>`).join('')
    return `<ol>${items}</ol>`
  }

  const heading = block.lines[0]?.match(/^(#{1,3})\s+(.+)$/)
  if (heading && block.lines.length === 1) {
    const level = heading[1]!.length
    const tag = level === 1 ? 'h4' : level === 2 ? 'h5' : 'h6'
    return `<${tag}>${inlineFormat(escapeHtml(heading[2]!))}</${tag}>`
  }

  const body = block.lines.map((l) => inlineFormat(escapeHtml(l))).join('<br>')
  return `<p>${body}</p>`
}

/** Safe subset of Markdown for assistant replies. */
export function renderChatMarkdown(text: string): string {
  const blocks = parseBlocks(text.trim())
  if (!blocks.length) return ''
  return `<div class="chat-md">${blocks.map(renderBlock).join('')}</div>`
}
