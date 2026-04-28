/**
 * Performance Optimizer
 * Aggressive caching and optimization strategies
 */

// Memory cache (in-memory, fast)
const memoryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60 * 1000; // 1 minute

// Client-side cache helper
export const clientCache = {
  get<T>(key: string): T | null {
    // Check memory cache first
    const memCached = memoryCache.get(key);
    if (memCached && Date.now() - memCached.timestamp < CACHE_DURATION) {
      return memCached.data as T;
    }

    // Check localStorage
    if (typeof window === 'undefined') return null;
    
    try {
      const item = localStorage.getItem(`cache_${key}`);
      if (!item) return null;

      const entry = JSON.parse(item);
      if (Date.now() - entry.timestamp > CACHE_DURATION) {
        localStorage.removeItem(`cache_${key}`);
        return null;
      }

      // Update memory cache
      memoryCache.set(key, { data: entry.value, timestamp: entry.timestamp });
      return entry.value as T;
    } catch {
      return null;
    }
  },

  set<T>(key: string, value: T): void {
    const timestamp = Date.now();
    
    // Update memory cache
    memoryCache.set(key, { data: value, timestamp });

    // Update localStorage
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(
        `cache_${key}`,
        JSON.stringify({ value, timestamp })
      );
    } catch (error) {
      console.warn('Failed to set cache:', error);
    }
  },

  remove(key: string): void {
    memoryCache.delete(key);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`cache_${key}`);
    }
  },

  clear(): void {
    memoryCache.clear();
    if (typeof window !== 'undefined') {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('cache_'))
        .forEach((key) => localStorage.removeItem(key));
    }
  },
};

// Debounce helper
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Throttle helper
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Virtual scrolling helper (client-side only)
// Note: This is a utility function, not a React hook
// For actual virtual scrolling, use a library like react-window
export function getVirtualScrollItems<T>(
  items: T[],
  itemHeight: number,
  scrollTop: number,
  containerHeight: number
) {
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  );

  return {
    visibleItems: items.slice(startIndex, endIndex),
    offsetY: startIndex * itemHeight,
    totalHeight: items.length * itemHeight,
    startIndex,
    endIndex,
  };
}

// Lazy load helper
export function lazyLoad<T>(
  loader: () => Promise<T>,
  cacheKey?: string
): Promise<T> {
  if (cacheKey) {
    const cached = clientCache.get<T>(cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }
  }

  return loader().then((data) => {
    if (cacheKey) {
      clientCache.set(cacheKey, data);
    }
    return data;
  });
}

