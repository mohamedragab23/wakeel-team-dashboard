'use client';

import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';
import { TableSkeleton } from '@/components/SkeletonLoader';

export default function AdminDebtsPage() {
  const { data: debts = [], isLoading } = useQuery({
    queryKey: ['admin', 'debts'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/debts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? data.data : [];
    },
  });

  const totalDebts = debts.reduce((sum: number, debt: any) => sum + (debt.amount || 0), 0);

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">إدارة الديون</h1>
            <p className="text-[rgba(234,240,255,0.70)]">جاري تحميل البيانات...</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          </div>
          <TableSkeleton />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">إدارة الديون</h1>
          <p className="text-[rgba(234,240,255,0.70)]">عرض وإدارة ديون المناديب</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-blue-800 font-semibold">إجمالي الديون:</span>
            <span className="text-2xl font-bold text-blue-900">{totalDebts.toFixed(2)} ج.م</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">كود المندوب</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">المبلغ</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">التاريخ</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {debts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-gray-500">
                      لا توجد ديون مسجلة
                    </td>
                  </tr>
                ) : (
                  debts.map((debt: any, index: number) => (
                    <tr key={`debt-${debt.riderCode}-${debt.date}-${index}`} className="hover:bg-gray-50">
                      <td className="py-4 px-6 text-sm text-gray-800 font-medium">{debt.riderCode}</td>
                      <td className="py-4 px-6 text-sm text-gray-800 font-semibold">{debt.amount.toFixed(2)} ج.م</td>
                      <td className="py-4 px-6 text-sm text-gray-600">{debt.date || '-'}</td>
                      <td className="py-4 px-6 text-sm text-gray-600">{debt.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

