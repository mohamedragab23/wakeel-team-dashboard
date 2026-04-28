// Client-side caching with localStorage for better performance
const CACHE_PREFIX = 'sheets_cache_';
const CACHE_TIMESTAMP_PREFIX = 'sheets_cache_ts_';
const DEFAULT_TTL = 2 * 60 * 1000; // 2 minutes

export const clientCache = {
  set: (key: string, data: any, ttl: number = DEFAULT_TTL) => {
    try {
      const timestamp = Date.now();
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
      localStorage.setItem(CACHE_TIMESTAMP_PREFIX + key, timestamp.toString());
      localStorage.setItem(CACHE_TIMESTAMP_PREFIX + key + '_ttl', ttl.toString());
    } catch (e) {
      // localStorage might be full or disabled
      console.warn('Failed to cache data:', e);
    }
  },

  get: <T>(key: string): T | null => {
    try {
      const data = localStorage.getItem(CACHE_PREFIX + key);
      const timestamp = localStorage.getItem(CACHE_TIMESTAMP_PREFIX + key);
      const ttl = localStorage.getItem(CACHE_TIMESTAMP_PREFIX + key + '_ttl');

      if (!data || !timestamp) return null;

      const age = Date.now() - parseInt(timestamp);
      const cacheTTL = ttl ? parseInt(ttl) : DEFAULT_TTL;

      if (age > cacheTTL) {
        // Cache expired
        clientCache.clear(key);
        return null;
      }

      return JSON.parse(data) as T;
    } catch (e) {
      return null;
    }
  },

  clear: (key?: string) => {
    try {
      if (key) {
        localStorage.removeItem(CACHE_PREFIX + key);
        localStorage.removeItem(CACHE_TIMESTAMP_PREFIX + key);
        localStorage.removeItem(CACHE_TIMESTAMP_PREFIX + key + '_ttl');
      } else {
        // Clear all cache
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith(CACHE_PREFIX) || k.startsWith(CACHE_TIMESTAMP_PREFIX)) {
            localStorage.removeItem(k);
          }
        });
      }
    } catch (e) {
      console.warn('Failed to clear cache:', e);
    }
  },

  has: (key: string): boolean => {
    return clientCache.get(key) !== null;
  },
};
