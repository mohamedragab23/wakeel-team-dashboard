'use client';

import { getStoredUser } from '@/lib/clientSession';
import { authFetch } from '@/lib/authFetch';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { adminCanAccessRecruitment, parseLimitedFeatures } from '@/lib/adminFeatureAccess';
import type { RecruitmentStats } from '@/lib/recruitment/types';

/** قسم إحصائيات التعيين في لوحة الأدمن */
export default function RecruitmentAdminDashboardSection() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const u = getStoredUser() || {};
      if (u.role !== 'admin') {
        setShow(false);
        return;
      }
      const limited = parseLimitedFeatures(u.permissions);
      setShow(limited === null || adminCanAccessRecruitment(u.permissions));
    } catch {
      setShow(false);
    }
  }, []);

  const { data: stats } = useQuery({
    queryKey: ['recruitment', 'stats'],
    enabled: show,
    queryFn: async () => {
      const res = await authFetch('/api/recruitment/stats');
      const json = await res.json();
      return json.success ? (json.data as RecruitmentStats) : null;
    } });

  if (!show) return null;

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mt-6">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-violet-900">📋 إدارة التعيين (المرشحين)</h3>
        <Link href="/recruitment" className="text-sm text-violet-700 hover:underline">
          فتح القسم →
        </Link>
      </div>
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="جدد هذا الأسبوع" value={stats.newThisWeek} />
          <Stat label="تم التواصل" value={stats.contacted} />
          <Stat label="لم يتم التواصل" value={stats.notContacted} />
          <Stat label="استلم المعدات" value={stats.equipmentReceived} />
        </div>
      ) : (
        <p className="text-sm text-violet-700">جاري التحميل...</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-violet-100">
      <p className="text-violet-600 text-xs">{label}</p>
      <p className="text-xl font-bold text-violet-900">{value}</p>
    </div>
  );
}
