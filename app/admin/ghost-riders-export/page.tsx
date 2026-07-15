'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import { Button } from '@/components/Button';

export default function GhostRidersExportPage() {
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [zone, setZone] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        startDate,
        endDate,
        zone,
      });

      const response = await fetch(`/api/admin/ghost-riders-export?${params}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'فشل التصدير');
      }

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ghost_Riders_${startDate}_to_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#EAF0FF] mb-2">
              🚨 تصدير المناديب الأشباح (Ghost Riders)
            </h1>
            <p className="text-[#94A3B8]">
              المناديب الموجودين في ملف الأداء اليومي لكن غير مسجلين في قائمة المناديب الرسمية
            </p>
          </div>

          {/* Export Form */}
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6">
            <div className="space-y-4">
              {/* Date Range */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                    من تاريخ
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                    إلى تاريخ
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Zone */}
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                  المنطقة
                </label>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">جميع المناطق</option>
                  <option value="Ain shams">Ain shams</option>
                  <option value="Alexandria">Alexandria</option>
                  <option value="El rehab city">El rehab city</option>
                  <option value="Heliopolis">Heliopolis</option>
                  <option value="Mansoura">Mansoura</option>
                  <option value="Nasr city">Nasr city</option>
                  <option value="Tagammaa golden square">Tagammaa golden square</option>
                </select>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
                  <p className="text-red-300 text-sm">❌ {error}</p>
                </div>
              )}

              {/* Export Button */}
              <Button
                onClick={handleExport}
                disabled={loading}
                variant="primary"
              >
                {loading ? '⏳ جاري التصدير...' : '📥 تصدير إلى Excel'}
              </Button>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
            <h3 className="text-lg font-semibold text-cyan-300 mb-2">
              📌 ما هي المناديب الأشباح؟
            </h3>
            <ul className="space-y-2 text-sm text-[#94A3B8]">
              <li>
                ✅ <strong>مناديب موجودين</strong> في ملف "البيانات اليومية" (ملف الأداء)
              </li>
              <li>
                ❌ <strong>لكن غير موجودين</strong> في قائمة المناديب الرسمية
              </li>
              <li>
                ⚠️ <strong>المشكلة:</strong> هذا يؤدي لأرقام غير دقيقة في التقارير
              </li>
              <li>
                🔧 <strong>الحل:</strong> إضافة المناديب المفقودين أو تصحيح الأكواد في ملف الأداء
              </li>
            </ul>
          </div>

          {/* Instructions */}
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h3 className="text-lg font-semibold text-amber-300 mb-2">
              💡 كيفية الاستخدام
            </h3>
            <ol className="space-y-2 text-sm text-[#94A3B8] list-decimal list-inside">
              <li>اختر الفترة الزمنية والمنطقة</li>
              <li>اضغط "تصدير إلى Excel"</li>
              <li>سيتم تحميل ملف Excel يحتوي على:
                <ul className="ml-6 mt-1 space-y-1">
                  <li>• كود المندوب (كما هو في ملف الأداء)</li>
                  <li>• عدد الأيام والساعات والأوردرات</li>
                  <li>• ملاحظات توضح ما إذا كان مسجلاً أم لا</li>
                </ul>
              </li>
              <li>راجع القائمة وأضف المناديب المفقودين أو صحح الأكواد</li>
            </ol>
          </div>
        </div>
      </div>
    </Layout>
  );
}
