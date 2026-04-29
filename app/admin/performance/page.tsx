'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import ExcelUpload from '@/components/ExcelUpload';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function AdminPerformancePage() {
  const [performanceDate, setPerformanceDate] = useState<string>('');
  const [clearing, setClearing] = useState(false);
  const [deletingDay, setDeletingDay] = useState(false);
  const queryClient = useQueryClient();
  const { data: performanceStats } = useQuery({
    queryKey: ['admin', 'performance-stats'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/performance/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? data.data : null;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (optimized for mobile)
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false,
  });

  return (
    <Layout>
      <div className="space-y-6 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#EAF0FF] mb-2 break-words">رفع بيانات الأداء</h1>
          <p className="text-[rgba(234,240,255,0.70)] text-sm sm:text-base break-words">
            رفع بيانات الأداء اليومية للمناديب من ملف Excel
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-6 min-w-0 overflow-hidden text-[#1e1e2f]">
          <h3 className="text-blue-800 font-semibold mb-2 break-words">📋 تنسيق الملف المطلوب:</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <p>الأعمدة المطلوبة (بالترتيب):</p>
            <ul className="list-disc list-inside mr-4 space-y-1">
              <li>التاريخ (Date)</li>
              <li>كود المندوب (Rider Code)</li>
              <li>ساعات العمل (Hours)</li>
              <li>البريك (Break)</li>
              <li>التأخير (Delay)</li>
              <li>الغياب (Absence) - نعم/لا</li>
              <li>الطلبات (Orders)</li>
              <li>معدل القبول (Acceptance Rate) - مثال: 95%</li>
              <li>المحفظة/المديونية (Debt)</li>
            </ul>
          </div>
        </div>

        {/* Date Selection for Performance Data */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
          <label htmlFor="performance-date" className="block text-sm font-medium text-gray-700 mb-2">
            تاريخ بيانات الأداء *
          </label>
          <input
            id="performance-date"
            name="performance-date"
            type="date"
            value={performanceDate}
            onChange={(e) => {
              const newDate = e.target.value;
              console.log('[AdminPerformancePage] Date changed:', newDate);
              setPerformanceDate(newDate);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            required
          />
          <p className="text-xs text-gray-500 mt-2">
            سيتم اعتماد هذا التاريخ لجميع السجلات المرفوعة في الملف
          </p>

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={!performanceDate || deletingDay}
              onClick={async () => {
                if (!performanceDate) return;
                const confirmed = confirm(
                  `⚠️ سيتم حذف جميع سجلات الأداء ليوم ${performanceDate} من النظام.\n\nهل تريد المتابعة؟`
                );
                if (!confirmed) return;
                setDeletingDay(true);
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch('/api/admin/performance/delete-day', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ date: performanceDate }),
                  });
                  const text = await res.text();
                  const data = (() => {
                    try {
                      return JSON.parse(text);
                    } catch {
                      return { success: false, error: text || `HTTP ${res.status}` };
                    }
                  })();
                  if (res.ok && data.success) {
                    alert(`✅ ${data.message || 'تم الحذف بنجاح'}`);
                    queryClient.invalidateQueries({ queryKey: ['admin', 'performance-stats'] });
                    queryClient.invalidateQueries({ queryKey: ['performance'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                    queryClient.invalidateQueries({ queryKey: ['riders'] });
                    queryClient.refetchQueries({ queryKey: ['admin', 'performance-stats'] });
                  } else {
                    alert(`❌ ${data.error || `فشل حذف اليوم (HTTP ${res.status})`}`);
                  }
                } catch (e: any) {
                  alert(`❌ حدث خطأ: ${e?.message || 'خطأ غير معروف'}`);
                } finally {
                  setDeletingDay(false);
                }
              }}
              className="sm:w-auto w-full px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingDay ? 'جاري حذف اليوم...' : '🗑️ حذف أداء هذا اليوم ثم إعادة رفعه'}
            </button>
            <div className="text-xs text-gray-500 sm:self-center">
              لو ظهر لك “تم رفع ملف الأداء مسبقاً”، احذف اليوم من هنا ثم ارفع الملف من جديد.
            </div>
          </div>
        </div>

        <ExcelUpload
          type="performance"
          performanceDate={performanceDate}
          onSuccess={(result) => {
            console.log('Performance upload success:', result);
          }}
          onError={(error) => {
            console.error('Performance upload error:', error);
          }}
        />
        
        {/* Debug: Show current performanceDate value */}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-xs text-gray-500 mt-2">
            Debug: performanceDate = "{performanceDate}" (length: {performanceDate.length})
          </div>
        )}

        {/* Clear All Performance Data Button */}
        <div className="bg-red-50 border border-red-200 rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">⚠️ تصفير بيانات الأداء</h3>
          <p className="text-sm text-red-700 mb-4">
            سيتم حذف جميع بيانات الأداء من النظام. هذه العملية لا يمكن التراجع عنها.
            بعد التصفير، يمكنك رفع ملفات جديدة لبيانات الأداء.
          </p>
          <button
            onClick={async () => {
              const confirmed = confirm(
                '⚠️ تحذير: سيتم حذف جميع بيانات الأداء من النظام.\n\n' +
                'هذه العملية لا يمكن التراجع عنها.\n\n' +
                'هل أنت متأكد من المتابعة؟'
              );

              if (!confirmed) return;

              setClearing(true);
              try {
                const token = localStorage.getItem('token');
                const response = await fetch('/api/admin/performance/clear', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                });

                const data = await response.json();

                if (data.success) {
                  alert('✅ تم تصفير جميع بيانات الأداء بنجاح');
                  
                  // Invalidate all queries to refresh data
                  queryClient.invalidateQueries({ queryKey: ['admin', 'performance-stats'] });
                  queryClient.invalidateQueries({ queryKey: ['performance'] });
                  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                  queryClient.invalidateQueries({ queryKey: ['riders'] });
                  
                  // Refetch stats
                  queryClient.refetchQueries({ queryKey: ['admin', 'performance-stats'] });
                } else {
                  alert(`❌ فشل تصفير البيانات: ${data.error || 'خطأ غير معروف'}`);
                }
              } catch (error: any) {
                console.error('Clear performance error:', error);
                alert(`❌ حدث خطأ: ${error.message || 'خطأ غير معروف'}`);
              } finally {
                setClearing(false);
              }
            }}
            disabled={clearing}
            className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {clearing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>جاري التصفير...</span>
              </>
            ) : (
              <span>🗑️ تصفير جميع بيانات الأداء</span>
            )}
          </button>
        </div>

        {performanceStats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
              <div className="text-sm text-gray-600 mb-1">إجمالي السجلات</div>
              <div className="text-2xl font-bold text-gray-800">{performanceStats.totalRecords || 0}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
              <div className="text-sm text-gray-600 mb-1">آخر تحديث</div>
              <div className="text-lg font-semibold text-gray-800">
                {performanceStats.lastUpdate ? new Date(performanceStats.lastUpdate).toLocaleDateString('ar-EG') : '-'}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
              <div className="text-sm text-gray-600 mb-1">عدد المناديب</div>
              <div className="text-2xl font-bold text-gray-800">{performanceStats.uniqueRiders || 0}</div>
            </div>
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
          <h3 className="text-yellow-800 font-semibold mb-2">🔍 للتحقق من البيانات:</h3>
          <p className="text-sm text-yellow-700 mb-2">
            يمكنك استخدام API للتحقق من البيانات في Google Sheets:
          </p>
          <code className="block bg-yellow-100 p-2 rounded text-xs mt-2">
            GET /api/admin/debug?action=performance
          </code>
          <p className="text-xs text-yellow-600 mt-2">
            أو للتحقق من بيانات مشرف معين: GET /api/admin/debug?action=supervisor&supervisorCode=XXX&startDate=2023-11-14&endDate=2023-11-15
          </p>
        </div>
      </div>
    </Layout>
  );
}

