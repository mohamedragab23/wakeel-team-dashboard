'use client';

import { getStoredUser } from '@/lib/clientSession';
import Layout from '@/components/Layout';
import TicketingSubNav from '@/components/ticketing/TicketingSubNav';
import { useEffect, useState } from 'react';

export default function TicketingLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const user = getStoredUser() || {};
      setIsAdmin(user?.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-2 sm:px-0">
        <h1 className="text-2xl font-bold mb-2">نظام التذاكر والطلبات التشغيلية</h1>
        <p className="text-sm text-[rgba(234,240,255,0.65)] mb-4">
          إرسال ومتابعة الطلبات التشغيلية — منفصل عن التحليلات والتقارير
        </p>
        <TicketingSubNav isAdmin={isAdmin} />
        {children}
      </div>
    </Layout>
  );
}
