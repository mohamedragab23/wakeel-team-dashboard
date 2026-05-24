'use client';

import OutreachLeadsTable from '@/components/recruitment/OutreachLeadsTable';

export default function RecruitmentOutreachPage() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-3">داتا العروض للمشرف</h2>
      <p className="text-sm text-[rgba(234,240,255,0.65)] mb-4">
        داتا منفصلة يرفعها الأدمن/مسؤول التعيينات للمشرف للتواصل، ثم يتم تحويل المقبولين إلى مرشحين فعليين.
      </p>
      <OutreachLeadsTable />
    </div>
  );
}

