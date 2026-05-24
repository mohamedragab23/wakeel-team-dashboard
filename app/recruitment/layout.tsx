'use client';

import Layout from '@/components/Layout';
import RecruitmentSubNav from '@/components/recruitment/RecruitmentSubNav';

export default function RecruitmentLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto">
        <h1 className="text-2xl font-bold mb-2">إدارة التعيينات</h1>
        <p className="text-sm text-[rgba(234,240,255,0.65)] mb-4">
          متابعة المرشحين من التقديم حتى استلام المعدات
        </p>
        <RecruitmentSubNav />
        {children}
      </div>
    </Layout>
  );
}
