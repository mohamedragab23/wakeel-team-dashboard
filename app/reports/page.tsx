'use client';

import Layout from '@/components/Layout';

export default function ReportsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">التقارير</h1>
          <p className="text-[rgba(234,240,255,0.70)]">تقارير شاملة عن الأداء والإحصائيات</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 text-[#1e1e2f]">
          <p className="text-gray-600 text-center py-8">
            صفحة التقارير قيد التطوير
          </p>
        </div>
      </div>
    </Layout>
  );
}

