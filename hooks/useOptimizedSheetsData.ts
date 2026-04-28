'use client';

import { useState, useEffect, useCallback } from 'react';
import { clientCache } from '@/lib/clientCache';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useOptimizedSheetsData<T>(
  fetchFn: () => Promise<T>,
  cacheKey: string,
  options?: { refetchInterval?: number; enabled?: boolean }
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  const fetchData = useCallback(async (useCache = true) => {
    try {
      setError(null);

      // Check cache first
      if (useCache) {
        const cached = clientCache.get<T>(cacheKey);
        if (cached) {
          setData(cached);
          setLoading(false);
          // Fetch fresh data in background
          fetchData(false);
          return;
        }
      }

      // Fetch fresh data
      const freshData = await fetchFn();
      setData(freshData);
      clientCache.set(cacheKey, freshData, CACHE_TTL);
      setLastUpdate(Date.now());
    } catch (err: any) {
      setError(err.message || 'حدث خطأ في جلب البيانات');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchFn, cacheKey]);

  useEffect(() => {
    if (options?.enabled === false) return;

    fetchData(true);

    // Set up background refresh if refetchInterval is provided
    if (options?.refetchInterval) {
      const interval = setInterval(() => {
        fetchData(false);
      }, options.refetchInterval);

      return () => clearInterval(interval);
    }
  }, [fetchData, options?.enabled, options?.refetchInterval]);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchData(false);
  }, [fetchData]);

  return { data, loading, error, refetch, lastUpdate };
}

