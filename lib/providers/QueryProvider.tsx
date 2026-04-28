'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 60 * 1000, // 10 minutes (optimized for mobile)
            gcTime: 30 * 60 * 1000, // 30 minutes (keep in memory longer)
            refetchOnWindowFocus: false,
            refetchOnMount: false, // Don't refetch on mount if data is fresh
            refetchOnReconnect: false, // Don't refetch on reconnect
            retry: 1,
            retryDelay: 1000,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

