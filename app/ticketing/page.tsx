'use client';

import { getStoredUser } from '@/lib/clientSession';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TicketingIndexPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const user = getStoredUser() || {};
      if (user?.role === 'admin') {
        router.replace('/ticketing/admin');
      } else {
        router.replace('/ticketing/my');
      }
    } catch {
      router.replace('/ticketing/my');
    }
  }, [router]);

  return <p className="text-sm text-[rgba(234,240,255,0.6)]">جاري التحميل…</p>;
}
