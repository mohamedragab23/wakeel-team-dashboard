'use client';

import SupervisorTableSection from '@/components/SupervisorTableSection';

interface TopRider {
  name: string;
  orders: number;
  hours: number;
  acceptance: number;
}

export default function TopRidersTable({ topRiders }: { topRiders: TopRider[] }) {
  return (
    <div className="rounded-[var(--v2-radius-xl)] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] shadow-[var(--v2-shadow-soft)] p-4 sm:p-6 min-w-0 overflow-hidden backdrop-blur-md">
      <SupervisorTableSection
        title="أفضل المناديب"
        fileNameBase="top-riders"
        sheetName="TopRiders"
        exportDisabled={topRiders.length === 0}
        getExportRows={() =>
          topRiders.map((r) => ({
            الاسم: r.name,
            الطلبات: r.orders,
            الساعات: Number(r.hours.toFixed(1)),
            'نسبة القبول': `${r.acceptance.toFixed(1)}%`,
          }))
        }
      >
        {topRiders.length > 0 ? (
          <div className="overflow-x-auto min-w-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.10)]">
                  <th className="text-right py-3 px-4 text-sm font-semibold text-[rgba(234,240,255,0.75)]">الاسم</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-[rgba(234,240,255,0.75)]">الطلبات</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-[rgba(234,240,255,0.75)]">الساعات</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-[rgba(234,240,255,0.75)]">نسبة القبول</th>
                </tr>
              </thead>
              <tbody>
                {topRiders.map((rider, index) => (
                  <tr key={index} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.04)]">
                    <td className="py-3 px-4 text-sm text-[#EAF0FF]">{rider.name}</td>
                    <td className="py-3 px-4 text-sm text-[rgba(234,240,255,0.70)]">{rider.orders}</td>
                    <td className="py-3 px-4 text-sm text-[rgba(234,240,255,0.70)]">{rider.hours.toFixed(1)}</td>
                    <td className="py-3 px-4 text-sm text-[rgba(234,240,255,0.70)]">{rider.acceptance.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-[rgba(234,240,255,0.60)]">لا توجد بيانات متاحة</div>
        )}
      </SupervisorTableSection>
    </div>
  );
}
