const svgAttrs = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'

export function iconPlus(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`
}

export function iconCheck(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><path d="M20 6L9 17l-5-5"/></svg>`
}

export function iconSwap(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><path d="M16 3h5v5M4 21H3v-5M21 8l-5 5M3 16l5-5M8 3H3v5M16 21h5v-5"/></svg>`
}

export function iconSearch(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`
}
