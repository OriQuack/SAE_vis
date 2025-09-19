/**
 * LRU (Least Recently Used) Cache implementation
 * For caching API responses and expensive computations
 */

class LRUNode<K, V> {
  key: K
  value: V
  prev: LRUNode<K, V> | null = null
  next: LRUNode<K, V> | null = null

  constructor(key: K, value: V) {
    this.key = key
    this.value = value
  }
}

export class LRUCache<K, V> {
  private capacity: number
  private cache: Map<K, LRUNode<K, V>>
  private head: LRUNode<K, V> | null = null
  private tail: LRUNode<K, V> | null = null

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Cache capacity must be greater than 0')
    }
    this.capacity = capacity
    this.cache = new Map()
  }

  /**
   * Get value from cache
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key)
    if (!node) {
      return undefined
    }

    // Move to front (most recently used)
    this.moveToFront(node)
    return node.value
  }

  /**
   * Set value in cache
   */
  set(key: K, value: V): void {
    const existingNode = this.cache.get(key)

    if (existingNode) {
      // Update existing node
      existingNode.value = value
      this.moveToFront(existingNode)
    } else {
      // Create new node
      const newNode = new LRUNode(key, value)

      // Add to cache
      this.cache.set(key, newNode)

      // Add to linked list
      if (!this.head) {
        this.head = this.tail = newNode
      } else {
        newNode.next = this.head
        this.head.prev = newNode
        this.head = newNode
      }

      // Remove least recently used if over capacity
      if (this.cache.size > this.capacity) {
        this.removeLRU()
      }
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key)
  }

  /**
   * Delete specific key from cache
   */
  delete(key: K): boolean {
    const node = this.cache.get(key)
    if (!node) {
      return false
    }

    this.removeNode(node)
    this.cache.delete(key)
    return true
  }

  /**
   * Clear all cached items
   */
  clear(): void {
    this.cache.clear()
    this.head = null
    this.tail = null
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Get all keys in order (most to least recently used)
   */
  keys(): K[] {
    const keys: K[] = []
    let current = this.head
    while (current) {
      keys.push(current.key)
      current = current.next
    }
    return keys
  }

  /**
   * Get all values in order (most to least recently used)
   */
  values(): V[] {
    const values: V[] = []
    let current = this.head
    while (current) {
      values.push(current.value)
      current = current.next
    }
    return values
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      capacity: this.capacity,
      usage: (this.cache.size / this.capacity) * 100,
      keys: this.keys()
    }
  }

  /**
   * Move node to front of linked list (most recently used)
   */
  private moveToFront(node: LRUNode<K, V>): void {
    if (node === this.head) {
      return
    }

    // Remove from current position
    this.removeNode(node)

    // Add to front
    node.next = this.head
    node.prev = null
    if (this.head) {
      this.head.prev = node
    }
    this.head = node

    if (!this.tail) {
      this.tail = node
    }
  }

  /**
   * Remove node from linked list
   */
  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next
    } else {
      this.head = node.next
    }

    if (node.next) {
      node.next.prev = node.prev
    } else {
      this.tail = node.prev
    }
  }

  /**
   * Remove least recently used item
   */
  private removeLRU(): void {
    if (!this.tail) {
      return
    }

    const lru = this.tail
    this.removeNode(lru)
    this.cache.delete(lru.key)
  }
}

/**
 * Create a memoized version of a function using LRU cache
 */
export function memoizeWithLRU<T extends (...args: any[]) => any>(
  fn: T,
  capacity: number = 100,
  keyGenerator?: (...args: Parameters<T>) => string
): T {
  const cache = new LRUCache<string, ReturnType<T>>(capacity)

  const defaultKeyGenerator = (...args: Parameters<T>) => {
    return JSON.stringify(args)
  }

  const generateKey = keyGenerator || defaultKeyGenerator

  return ((...args: Parameters<T>) => {
    const key = generateKey(...args)

    if (cache.has(key)) {
      return cache.get(key)
    }

    const result = fn(...args)
    cache.set(key, result)
    return result
  }) as T
}

/**
 * Time-based cache with expiration
 */
export class TimedCache<K, V> {
  private cache: Map<K, { value: V; expiry: number }>
  private defaultTTL: number

  constructor(defaultTTL: number = 60000) { // Default 1 minute
    this.cache = new Map()
    this.defaultTTL = defaultTTL
  }

  set(key: K, value: V, ttl?: number): void {
    const expiry = Date.now() + (ttl || this.defaultTTL)
    this.cache.set(key, { value, expiry })
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key)

    if (!item) {
      return undefined
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key)
      return undefined
    }

    return item.value
  }

  has(key: K): boolean {
    return this.get(key) !== undefined
  }

  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  /**
   * Clean up expired items
   */
  cleanup(): void {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key)
      }
    }
  }
}