let active: { remove: () => void } | null = null

/** Frosted backdrop + sheen (no displacement / mirror strips). */
export function mountCartGlass(bar: HTMLElement): void {
  unmountCartGlass()

  const computed = getComputedStyle(bar)
  if (computed.position === 'static') bar.style.position = 'relative'
  if (computed.zIndex === 'auto') bar.style.zIndex = '0'

  const backdrop = document.createElement('div')
  backdrop.className = 'cart-glass-backdrop'
  backdrop.setAttribute('aria-hidden', 'true')

  const sheen = document.createElement('div')
  sheen.className = 'cart-glass-sheen'
  sheen.setAttribute('aria-hidden', 'true')

  bar.append(backdrop, sheen)

  active = {
    remove: () => {
      backdrop.remove()
      sheen.remove()
    },
  }
}

export function unmountCartGlass(): void {
  active?.remove()
  active = null
}
