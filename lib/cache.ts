// Simple in-memory cache with TTL (Time To Live)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class Cache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL = 15 * 60 * 1000; // 15 minutes default (optimized for mobile performance)

  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  keys(): string[] {
    const now = Date.now();
    const validKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp <= entry.ttl) {
        validKeys.push(key);
      } else {
        // Remove expired entries
        this.cache.delete(key);
      }
    }
    
    return validKeys;
  }
}

export const cache = new Cache();

// Cache keys
export const CACHE_KEYS = {
  sheetData: (sheetName: string) => `sheet:${sheetName}`,
  shiftsSheetData: (sheetName: string) => `shifts:sheet:${sheetName}`,
  supervisorRiders: (code: string) => `riders:${code}`,
  dashboardData: (code: string) => `dashboard:${code}`,
  ridersData: (code: string) => `ridersData:${code}`,
  performanceData: (code: string, start?: string, end?: string) =>
    `performance:${code}:${start || ''}:${end || ''}`,
};

