'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import { useMutation } from '@tanstack/react-query';

export default function SyncPage() {
  const [syncType, setSyncType] = useState<'riders' | 'performance' | 'debts' | 'all'>('all');

  const syncMutation = useMutation({
    mutationFn: async (type: string) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(`✅ تمت المزامنة بنجاح!\n${JSON.stringify(data, null, 2)}`);
      } else {
        alert(`❌ فشلت المزامنة: ${data.error}`);
      }
    },
    onError: (error: any) => {
      alert(`❌ خطأ: ${error.message}`);
    },
  });

  const handleSync = () => {
    if (confirm(`هل تريد مزامنة ${syncType === 'all' ? 'جميع البيانات' : syncType}؟`)) {
      syncMutation.mutate(syncType);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">مزامنة البيانات</h1>
          <p className="text-[rgba(234,240,255,0.70)]">مزامنة قاعدة البيانات المحلية مع Google Sheets</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="space-y-4">
            <div>
              <label htmlFor="sync-type-select" className="block text-sm font-medium text-gray-700 mb-2">نوع المزامنة</label>
              <select
                id="sync-type-select"
                name="sync-type-select"
                value={syncType}
                onChange={(e) => setSyncType(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="all">مزامنة كاملة (جميع البيانات)</option>
                <option value="riders">المناديب فقط</option>
                <option value="performance">بيانات الأداء فقط</option>
                <option value="debts">الديون فقط</option>
              </select>
            </div>

            <button
              onClick={handleSync}
              disabled={syncMutation.isPending}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncMutation.isPending ? 'جاري المزامنة...' : 'بدء المزامنة'}
            </button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">معلومات عن المزامنة</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <p>• المزامنة تحدث تلقائياً عند رفع الملفات</p>
            <p>• يمكنك استخدام هذه الصفحة للمزامنة اليدوية</p>
            <p>• المزامنة لا تحذف البيانات الموجودة في Google Sheets</p>
            <p>• البيانات الجديدة فقط يتم إضافتها</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

