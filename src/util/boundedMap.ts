/**
 * A Map with a fixed capacity that evicts the least-recently-used entry once
 * full. Optionally run a callback (e.g. URL.revokeObjectURL) on evicted values.
 */
export class BoundedMap<K, V> {
  private readonly map = new Map<K, V>()
  private readonly maxSize: number
  private readonly onEvict?: (value: V, key: K) => void

  constructor(maxSize: number, onEvict?: (value: V, key: K) => void) {
    this.maxSize = maxSize
    this.onEvict = onEvict
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined
    const value = this.map.get(key) as V
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  set(key: K, value: V): void {
    const existed = this.map.has(key)
    this.map.set(key, value)
    if (existed) return
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      const evicted = this.map.get(oldest)
      this.map.delete(oldest)
      if (evicted !== undefined) this.onEvict?.(evicted, oldest)
    }
  }

  delete(key: K): boolean {
    return this.map.delete(key)
  }
}
