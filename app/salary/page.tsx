'use client';

import { useState, useCallback, useEffect } from 'react';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';

interface SalaryCalculation {
  supervisorId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  salaryMethod: 'fixed' | 'commission_type1' | 'commission_type2' | 'legacy_multiplier';
  baseAmount: number;
  commission?: {
    type?: string;
    totalOrders: number;
    totalHours: number;
    commissionRate: number;
    workingDays?: number;
    calculatedCommission: number;
    details?: Record<string, unknown>;
  };
  deductions: {
    advances: number;
    advancesDetails?: { date: string; amount: number }[];
    deductions: number;
    deductionsDetails?: { date: string; reason: string; amount: number }[];
    performance?: number;
    performanceDetails?: { date: string; reason: string; amount: number }[];
    equipment: number;
    equipmentDetails?: { name: string; quantity: number; price: number; total: number }[];
    security: number;
    admin?: number;
    adminDetails?: { date: string; reason: string; amount: number }[];
    total: number;
  };
  netSalary: number;
  breakdown: {
    date: string;
    orders: number;
    hours: number;
    multiplier: number;
    dailyCommission: number;
  }[];
  riderPerformance?: { code: string; name: string; totalOrders: number; totalHours: number }[];
  periodTotals?: { totalOrders: number; totalHours: number };
}

export default function SalaryPage() {
  // Use refs to track pending date changes
  const [confirmedStartDate, setConfirmedStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [confirmedEndDate, setConfirmedEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  
  // Temporary state for date inputs (doesn't trigger query)
  const [tempStartDate, setTempStartDate] = useState(confirmedStartDate);
  const [tempEndDate, setTempEndDate] = useState(confirmedEndDate);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Check if dates have changed
  useEffect(() => {
    setHasChanges(tempStartDate !== confirmedStartDate || tempEndDate !== confirmedEndDate);
  }, [tempStartDate, tempEndDate, confirmedStartDate, confirmedEndDate]);

  // Apply date changes
  const applyDateChanges = useCallback(() => {
    if (tempStartDate && tempEndDate) {
      setConfirmedStartDate(tempStartDate);
      setConfirmedEndDate(tempEndDate);
      setHasChanges(false);
    }
  }, [tempStartDate, tempEndDate]);

  const { data: salaryData, isLoading, error, isFetching } = useQuery({
    queryKey: ['salary', confirmedStartDate, confirmedEndDate],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/salary/calculate?startDate=${confirmedStartDate}&endDate=${confirmedEndDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل تحميل البيانات');
      return data.data as SalaryCalculation;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (optimized for mobile)
    gcTime: 30 * 60 * 1000, // 30 minutes garbage collection
    refetchOnMount: false, // Don't refetch if data is fresh
    refetchOnWindowFocus: false,
  });


  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)} ج.م`;
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">جاري حساب الراتب...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">حساب الراتب</h1>
          <p className="text-[rgba(234,240,255,0.70)]">تفاصيل الراتب والخصومات</p>
        </div>

        {/* Date Range Selector - No auto-reload */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 text-[#1e1e2f]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="salary-start-date" className="block text-sm font-medium text-gray-700 mb-2">من تاريخ</label>
              <input
                id="salary-start-date"
                name="salary-start-date"
                type="date"
                value={tempStartDate}
                onChange={(e) => setTempStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label htmlFor="salary-end-date" className="block text-sm font-medium text-gray-700 mb-2">إلى تاريخ</label>
              <input
                id="salary-end-date"
                name="salary-end-date"
                type="date"
                value={tempEndDate}
                onChange={(e) => setTempEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <button
                onClick={applyDateChanges}
                disabled={!hasChanges || isFetching}
                className={`w-full px-4 py-2 rounded-lg font-medium transition-all ${
                  hasChanges && !isFetching
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isFetching ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                    جاري التحميل...
                  </span>
                ) : (
                  '🔍 عرض الراتب'
                )}
              </button>
            </div>
          </div>
          {hasChanges && (
            <p className="text-sm text-amber-600 mt-2">
              ⚠️ تم تغيير التاريخ. اضغط "عرض الراتب" لتحديث البيانات.
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error instanceof Error ? error.message : 'حدث خطأ في تحميل البيانات'}
          </div>
        )}

        {salaryData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Salary Details */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">تفاصيل الراتب</h3>
              <div className="space-y-3">
                {salaryData.salaryMethod === 'fixed' ? (
                  <>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-600">نوع الراتب:</span>
                      <span className="font-semibold text-gray-800">راتب ثابت</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-600">الراتب الأساسي:</span>
                      <span className="font-semibold text-gray-800">{formatCurrency(salaryData.baseAmount)}</span>
                    </div>
                  </>
                ) : salaryData.salaryMethod === 'legacy_multiplier' ? (
                  <>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-600">نوع الراتب:</span>
                      <span className="font-semibold text-gray-800">عمولة (نظام قديم)</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-600">إجمالي الطلبات / الساعات:</span>
                      <span className="font-semibold text-gray-800">
                        {salaryData.periodTotals?.totalOrders ?? 0} طلب —{' '}
                        {(salaryData.periodTotals?.totalHours ?? 0).toFixed(1)} س
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-600">نوع الراتب:</span>
                      <span className="font-semibold text-gray-800">
                        {salaryData.salaryMethod === 'commission_type2'
                          ? 'عمولة (نوع 2 — قبض المشرف)'
                          : 'عمولة (نوع 1)'}
                      </span>
                    </div>
                    {salaryData.commission && (
                      <>
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-gray-600">إجمالي الطلبات:</span>
                          <span className="font-semibold text-gray-800">{salaryData.commission.totalOrders}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-gray-600">إجمالي الساعات (مناديبك):</span>
                          <span className="font-semibold text-gray-800">
                            {(salaryData.commission.totalHours || 0).toFixed(1)} ساعة
                          </span>
                        </div>
                        {salaryData.salaryMethod === 'commission_type1' &&
                          salaryData.commission.workingDays !== undefined && (
                            <div className="flex justify-between py-2 border-b">
                              <span className="text-gray-600">أيام بها نشاط:</span>
                              <span className="font-semibold text-gray-800">
                                {salaryData.commission.workingDays} يوم
                              </span>
                            </div>
                          )}
                        {salaryData.salaryMethod === 'commission_type1' && (
                          <div className="flex justify-between py-2 border-b bg-green-50 px-2 rounded">
                            <span className="text-gray-600">معدل العمولة (حسب إجمالي الساعات):</span>
                            <span className="font-semibold text-green-700">
                              {(salaryData.commission.commissionRate || 0).toFixed(2)} ج.م لكل طلب
                            </span>
                          </div>
                        )}
                        {salaryData.salaryMethod === 'commission_type2' &&
                          salaryData.commission.details &&
                          typeof salaryData.commission.details === 'object' && (
                            <>
                              <div className="flex justify-between py-2 border-b">
                                <span className="text-gray-600">إجمالي قبض المشرف (الفترة):</span>
                                <span className="font-semibold text-gray-800">
                                  {formatCurrency(
                                    Number(
                                      (salaryData.commission.details as { totalSupervisorReceipts?: number })
                                        .totalSupervisorReceipts || 0
                                    )
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between py-2 border-b text-sm text-gray-600">
                                <span>القيمة الأساسية (بعد النسبة الأساسية)</span>
                                <span>
                                  {formatCurrency(
                                    Number((salaryData.commission.details as { baseValue?: number }).baseValue || 0)
                                  )}
                                </span>
                              </div>
                            </>
                          )}
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-gray-600">العمولة المحسوبة:</span>
                          <span className="font-semibold text-green-600">
                            {formatCurrency(salaryData.commission.calculatedCommission || 0)}
                          </span>
                        </div>
                      </>
                    )}
                  </>
                )}
                <div className="flex justify-between py-2 pt-4 border-t-2 border-gray-300">
                  <span className="text-lg font-semibold text-gray-800">إجمالي الراتب:</span>
                  <span className="text-xl font-bold text-blue-600">{formatCurrency(salaryData.baseAmount)}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">الخصومات</h3>
              <div className="space-y-3">
                {/* السلف مع التفاصيل */}
                <div className="py-2 border-b">
                  <div className="flex justify-between">
                    <span className="text-gray-600">السلف:</span>
                    <span className="font-semibold text-red-600">
                      -{formatCurrency(salaryData.deductions.advances)}
                    </span>
                  </div>
                  {salaryData.deductions.advancesDetails && salaryData.deductions.advancesDetails.length > 0 && (
                    <div className="mt-2 mr-4 text-sm bg-gray-50 rounded-lg p-3">
                      {salaryData.deductions.advancesDetails.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-gray-600 py-1">
                          <span>📅 {item.date}</span>
                          <span className="text-red-500">-{item.amount} ج.م</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* الخصومات مع التفاصيل */}
                <div className="py-2 border-b">
                  <div className="flex justify-between">
                    <span className="text-gray-600">الخصومات (عامة):</span>
                    <span className="font-semibold text-red-600">
                      -{formatCurrency(salaryData.deductions.deductions)}
                    </span>
                  </div>
                  {salaryData.deductions.deductionsDetails && salaryData.deductions.deductionsDetails.length > 0 && (
                    <div className="mt-2 mr-4 text-sm bg-gray-50 rounded-lg p-3">
                      {salaryData.deductions.deductionsDetails.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-gray-600 py-1">
                          <span>
                            📅 {item.date} - {item.reason}
                          </span>
                          <span className="text-red-500">-{item.amount} ج.م</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {(salaryData.deductions.performance ?? 0) > 0 && (
                  <div className="py-2 border-b">
                    <div className="flex justify-between">
                      <span className="text-gray-600">خصم الأداء:</span>
                      <span className="font-semibold text-red-600">
                        -{formatCurrency(salaryData.deductions.performance ?? 0)}
                      </span>
                    </div>
                    {salaryData.deductions.performanceDetails &&
                      salaryData.deductions.performanceDetails.length > 0 && (
                        <div className="mt-2 mr-4 text-sm bg-amber-50 rounded-lg p-3">
                          {salaryData.deductions.performanceDetails.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-gray-600 py-1">
                              <span>
                                📅 {item.date} - {item.reason}
                              </span>
                              <span className="text-red-500">-{item.amount} ج.م</span>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                )}
                {(salaryData.deductions.admin ?? 0) > 0 && (
                  <div className="py-2 border-b">
                    <div className="flex justify-between">
                      <span className="text-gray-600">خصومات الإدارة:</span>
                      <span className="font-semibold text-red-600">
                        -{formatCurrency(salaryData.deductions.admin ?? 0)}
                      </span>
                    </div>
                    {salaryData.deductions.adminDetails && salaryData.deductions.adminDetails.length > 0 && (
                      <div className="mt-2 mr-4 text-sm bg-purple-50 rounded-lg p-3">
                        {salaryData.deductions.adminDetails.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-gray-600 py-1">
                            <span>
                              📅 {item.date} - {item.reason}
                            </span>
                            <span className="text-red-500">-{item.amount} ج.م</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="py-2 border-b">
                  <div className="flex justify-between">
                    <span className="text-gray-600">تكلفة المعدات:</span>
                    <span className="font-semibold text-red-600">
                      -{formatCurrency(salaryData.deductions.equipment)}
                    </span>
                  </div>
                  {/* Equipment Details Breakdown */}
                  {salaryData.deductions.equipmentDetails && salaryData.deductions.equipmentDetails.length > 0 && (
                    <div className="mt-2 mr-4 text-sm bg-gray-50 rounded-lg p-3">
                      {salaryData.deductions.equipmentDetails.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-gray-600 py-1">
                          <span>{item.name} ({item.quantity} × {item.price} ج.م)</span>
                          <span className="text-red-500">-{item.total} ج.م</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">تكلفة الاستعلامات الأمنية:</span>
                  <span className="font-semibold text-red-600">
                    -{formatCurrency(salaryData.deductions.security)}
                  </span>
                </div>
                <div className="flex justify-between py-2 pt-4 border-t-2 border-gray-300">
                  <span className="text-lg font-semibold text-gray-800">إجمالي الخصومات:</span>
                  <span className="text-xl font-bold text-red-600">
                    -{formatCurrency(salaryData.deductions.total)}
                  </span>
                </div>
                <div className="flex justify-between py-2 pt-4 border-t-2 border-blue-300 bg-blue-50 rounded-lg p-3">
                  <span className="text-xl font-bold text-gray-800">الراتب الصافي:</span>
                  <span className="text-2xl font-bold text-blue-600">{formatCurrency(salaryData.netSalary)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Daily activity + commission (type 1) */}
        {salaryData && salaryData.salaryMethod !== 'fixed' && salaryData.breakdown && salaryData.breakdown.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {salaryData.salaryMethod === 'commission_type1'
                ? 'تفاصيل يومية (الطلبات والساعات — عمولة نوع 1)'
                : 'تفاصيل يومية (الطلبات والساعات)'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">التاريخ</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">الطلبات</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">الساعات</th>
                    {salaryData.salaryMethod === 'commission_type1' && (
                      <>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">ج.م/طلب</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">عمولة يومية</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {salaryData.breakdown.map((day, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-800">{day.date}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{day.orders}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{(day.hours || 0).toFixed(1)}</td>
                      {salaryData.salaryMethod === 'commission_type1' && (
                        <>
                          <td className="py-3 px-4 text-sm text-gray-600">{(day.multiplier || 0).toFixed(2)}</td>
                          <td className="py-3 px-4 text-sm font-semibold text-green-600">
                            {formatCurrency(day.dailyCommission)}
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

        {salaryData && salaryData.riderPerformance && salaryData.riderPerformance.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">أداء المناديب (الفترة المحددة)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">المندوب</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">الكود</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">الساعات</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">الطلبات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {salaryData.riderPerformance.map((r) => (
                    <tr key={r.code} className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-800">{r.name}</td>
                      <td className="py-3 px-4 text-gray-600">{r.code}</td>
                      <td className="py-3 px-4 text-gray-600">{r.totalHours.toFixed(1)}</td>
                      <td className="py-3 px-4 text-gray-600">{r.totalOrders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

