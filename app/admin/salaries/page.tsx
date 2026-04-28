'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';

interface Supervisor {
  code: string;
  name: string;
}

interface SalaryCalculation {
  supervisorId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  salaryMethod: 'fixed' | 'commission_type1' | 'commission_type2';
  baseAmount: number;
  commission?: {
    type: 'type1' | 'type2';
    totalOrders: number;
    totalHours: number;
    calculatedCommission: number;
    details: any;
  };
  deductions: {
    advances: number;
    deductions: number;
    equipment: number;
    security: number;
    performance: number;
    total: number;
  };
  netSalary: number;
  breakdown: Array<{
    date: string;
    orders: number;
    hours: number;
    multiplier: number;
    dailyCommission: number;
  }>;
}

export default function AdminSalariesPage() {
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return firstDay.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Fetch supervisors
  const { data: supervisors = [] } = useQuery({
    queryKey: ['admin', 'supervisors'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/supervisors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? data.data : [];
    },
  });

  // Fetch salary calculation
  const { data: salaryData, isLoading } = useQuery({
    queryKey: ['admin', 'salary', selectedSupervisor, startDate, endDate],
    queryFn: async () => {
      if (!selectedSupervisor) return null;
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/admin/salary/calculate?supervisorCode=${selectedSupervisor}&startDate=${startDate}&endDate=${endDate}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      return data.success ? (data.data as SalaryCalculation) : null;
    },
    enabled: !!selectedSupervisor && !!startDate && !!endDate,
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">حساب رواتب المشرفين</h1>
          <p className="text-[rgba(234,240,255,0.70)]">حساب رواتب المشرفين حسب نظام الراتب المحدد لكل مشرف</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="salary-supervisor-select" className="block text-sm font-medium text-gray-700 mb-2">اختر المشرف *</label>
              <select
                id="salary-supervisor-select"
                name="salary-supervisor-select"
                value={selectedSupervisor}
                onChange={(e) => setSelectedSupervisor(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">اختر مشرف</option>
                {supervisors.map((s: Supervisor, index: number) => (
                  <option key={`supervisor-${s.code}-${index}`} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="salary-start-date" className="block text-sm font-medium text-gray-700 mb-2">من تاريخ</label>
              <input
                id="salary-start-date"
                name="salary-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label htmlFor="salary-end-date" className="block text-sm font-medium text-gray-700 mb-2">إلى تاريخ</label>
              <input
                id="salary-end-date"
                name="salary-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">جاري حساب الراتب...</p>
          </div>
        )}

        {salaryData && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <p className="text-sm text-gray-600 mb-1">الراتب الأساسي</p>
                <p className="text-2xl font-bold text-blue-600">{salaryData.baseAmount.toFixed(2)} ج.م</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <p className="text-sm text-gray-600 mb-1">إجمالي الخصومات</p>
                <p className="text-2xl font-bold text-red-600">{salaryData.deductions.total.toFixed(2)} ج.م</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <p className="text-sm text-gray-600 mb-1">الراتب الصافي</p>
                <p className="text-2xl font-bold text-green-600">{salaryData.netSalary.toFixed(2)} ج.م</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <p className="text-sm text-gray-600 mb-1">نوع الراتب</p>
                <p className="text-lg font-semibold text-gray-800">
                  {salaryData.salaryMethod === 'fixed'
                    ? 'راتب ثابت'
                    : salaryData.salaryMethod === 'commission_type1'
                    ? 'عمولة (نوع 1)'
                    : 'عمولة (نوع 2)'}
                </p>
              </div>
            </div>

            {/* Commission Details */}
            {salaryData.commission && (
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">تفاصيل العمولة</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">إجمالي الطلبات</p>
                    <p className="text-xl font-semibold text-gray-800">{salaryData.commission.totalOrders}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">إجمالي الساعات</p>
                    <p className="text-xl font-semibold text-gray-800">{salaryData.commission.totalHours.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">العمولة المحسوبة</p>
                    <p className="text-xl font-semibold text-blue-600">
                      {salaryData.commission.calculatedCommission.toFixed(2)} ج.م
                    </p>
                  </div>
                  {salaryData.commission.type === 'type1' && salaryData.commission.details?.ratePerOrder && (
                    <div>
                      <p className="text-sm text-gray-600">معدل العمولة</p>
                      <p className="text-xl font-semibold text-gray-800">
                        {salaryData.commission.details.ratePerOrder.toFixed(2)} ج.م/طلب
                      </p>
                    </div>
                  )}
                  {salaryData.commission.type === 'type2' && salaryData.commission.details && (
                    <>
                      <div>
                        <p className="text-sm text-gray-600">إجمالي القبض</p>
                        <p className="text-xl font-semibold text-gray-800">
                          {salaryData.commission.details.totalReceipts?.toFixed(2) || '0'} ج.م
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">القيمة الأساسية</p>
                        <p className="text-xl font-semibold text-gray-800">
                          {salaryData.commission.details.baseValue?.toFixed(2) || '0'} ج.م
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Deductions Breakdown */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4">تفاصيل الخصومات</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-sm text-gray-600">السلف</p>
                  <p className="text-lg font-semibold text-red-600">
                    {salaryData.deductions.advances.toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">الخصومات</p>
                  <p className="text-lg font-semibold text-red-600">
                    {salaryData.deductions.deductions.toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">المعدات</p>
                  <p className="text-lg font-semibold text-red-600">
                    {salaryData.deductions.equipment.toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">الاستعلام الأمني</p>
                  <p className="text-lg font-semibold text-red-600">
                    {salaryData.deductions.security.toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">خصم الأداء</p>
                  <p className="text-lg font-semibold text-red-600">
                    {salaryData.deductions.performance.toFixed(2)} ج.م
                  </p>
                </div>
              </div>
            </div>

            {/* Daily Breakdown */}
            {salaryData.breakdown && salaryData.breakdown.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">التفصيل اليومي</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">التاريخ</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">الطلبات</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">الساعات</th>
                        {salaryData.salaryMethod !== 'fixed' && (
                          <>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">المعامل</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">العمولة اليومية</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {salaryData.breakdown.map((day, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-800">
                            {new Date(day.date).toLocaleDateString('ar-EG', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="py-3 px-4 text-gray-600">{day.orders}</td>
                          <td className="py-3 px-4 text-gray-600">{day.hours.toFixed(1)}</td>
                          {salaryData.salaryMethod !== 'fixed' && (
                            <>
                              <td className="py-3 px-4 text-gray-600">{day.multiplier.toFixed(2)}</td>
                              <td className="py-3 px-4 text-blue-600 font-semibold">
                                {day.dailyCommission.toFixed(2)} ج.م
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!isLoading && !salaryData && selectedSupervisor && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">لا توجد بيانات متاحة للفترة المحددة</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

