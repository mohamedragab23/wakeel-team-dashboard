'use client';

import { authFetch } from '@/lib/authFetch';
import { getStoredUser } from '@/lib/clientSession';
import { useQuery } from '@tanstack/react-query';
import RecruitmentStatsCards from '@/components/recruitment/RecruitmentStatsCards';
import ResetManagerDataCard from '@/components/recruitment/ResetManagerDataCard';
import Card from '@/components/ui-v2/Card';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RecruitmentStats } from '@/lib/recruitment/types';

export default function RecruitmentDashboardPage() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      setIsAdmin(getStoredUser()?.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['recruitment', 'stats'],
    queryFn: async () => {
      const res = await authFetch('/api/recruitment/stats');
      const json = await res.json();
      return json.success ? (json.data as RecruitmentStats) : null;
    },
  });

  const defaultStats: RecruitmentStats = {
    newThisWeek: 0,
    contacted: 0,
    notContacted: 0,
    attendedLecture: 0,
    equipmentReceived: 0,
    totalActive: 0,
  };

  return (
    <div className="space-y-6">
      {isAdmin ? <ResetManagerDataCard /> : null}
      {isLoading ? (
        <p>جاري تحميل الإحصائيات...</p>
      ) : (
        <RecruitmentStatsCards stats={stats ?? defaultStats} />
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <QuickLink
          href="/recruitment/candidates"
          title="إدخال / متابعة المرشحين"
          desc="سير العمل الجديد: بيانات → عائلة → محاضرة → تفعيل → معدات"
        />
        {isAdmin ? (
          <>
            <QuickLink
              href="/recruitment/archive"
              title="إعادة التفعيل"
              desc="مرشحون قدامى/مؤرشفون قابلون للعودة (أدمن)"
            />
            <QuickLink
              href="/recruitment/bulk-import"
              title="الرفع المجمع"
              desc="رفع منفصل للتعيين الجديد وإعادة التفعيل (أدمن)"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href}>
      <Card className="p-5 hover:border-[rgba(0,245,255,0.35)] transition-colors h-full">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="text-sm text-[rgba(234,240,255,0.65)] mt-1">{desc}</p>
      </Card>
    </Link>
  );
}
