'use client';

import OutreachLeadsTable from '@/components/recruitment/OutreachLeadsTable';

export default function RecruitmentOutreachPage() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-3">قاعدة تواصل المشرف (داتا العروض)</h2>
      <p className="text-sm text-[rgba(234,240,255,0.65)] mb-4">
        هذه ليست تعيينات نهائية. الهدف منها: رفع ليدات أولية للمشرف للتواصل، وبعد ظهور مرشح مناسب يتم
        تحويله لملف مرشح فعلي داخل "جميع المتقدمين".
      </p>
      <OutreachLeadsTable />
    </div>
  );
}

