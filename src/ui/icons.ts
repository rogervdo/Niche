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

export function iconGear(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
}

export function iconList(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`
}

export function iconGrid(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`
}

export function iconRefresh(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>`
}

export function iconDuplicates(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/></svg>`
}

export function iconChevronLeft(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><path d="M15 18l-6-6 6-6"/></svg>`
}

export function iconChevronRight(size = 18): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><path d="M9 18l6-6-6-6"/></svg>`
}

const heartFillAttrs =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"'

export function iconHeart(size = 16): string {
  return `<svg ${heartFillAttrs} width="${size}" height="${size}"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
}

export function iconHeartOutline(size = 16): string {
  return `<svg ${svgAttrs} width="${size}" height="${size}"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3z"/></svg>`
}
