'use client';

import CandidatesTable from '@/components/recruitment/CandidatesTable';

export default function RecruitmentArchivePage() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">المرشحون القدماء (الأرشيف)</h2>
      <p className="text-sm text-[rgba(234,240,255,0.65)] mb-4">
        يمكنك إعادة تفعيل المرشح أو تسجيل اهتمامه بالعودة
      </p>
      <CandidatesTable mode="archive" />
    </div>
  );
}
