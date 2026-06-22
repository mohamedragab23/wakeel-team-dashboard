'use client';

import { authFetch } from '@/lib/authFetch';
import { useState } from 'react';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';
import { ZONE_OPTIONS } from '@/lib/zones';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

type ReactivationRequestRow = {
  id: number;
  supervisorCode: string;
  supervisorName: string;
  riderCode: string;
  riderName: string;
  zone?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
  approvalDate: string;
  approvedBy: string;
};

function statusLabel(s: ReactivationRequestRow['status']) {
  if (s === 'approved') return 'موافق عليها';
  if (s === 'rejected') return 'مرفوضة';
  return 'قيد الانتظار';
}

export default function ReactivationRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [riderCode, setRiderCode] = useState('');
  const [riderName, setRiderName] = useState('');
  const [zone, setZone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['reactivation-requests-viewer', statusFilter],
    queryFn: async () => {
      const url = new URL('/api/reactivation-requests', window.location.origin);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      const res = await authFetch(url.toString());
      const data = await res.json();
      return (data?.success ? (data.data as ReactivationRequestRow[]) : []) ?? [];
    } });

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await authFetch('/api/reactivation-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify({
          riderCode: riderCode.trim(),
          riderName: riderName.trim(),
          zone: zone.trim() }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل إرسال الطلب');
      setMsg({ type: 'ok', text: '✅ تم إرسال طلب إعادة التفعيل بنجاح' });
      setRiderCode('');
      setRiderName('');
      setZone('');
      await refetch();
    } catch (error: any) {
      setMsg({ type: 'err', text: `❌ ${error.message || 'حدث خطأ'}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">طلبات إعادة التفعيل</h1>
          <p className="text-[rgba(234,240,255,0.70)]">
            اطلب إعادة تفعيل مندوب سبق إقالته ليعود للعمل ويظهر أداؤه بشكل طبيعي.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-[#1e1e2f]">
          <h2 className="text-lg font-semibold mb-3">إرسال طلب إعادة تفعيل</h2>
          {msg && (
            <div
              className={`mb-4 rounded-lg px-3 py-2 text-sm ${
                msg.type === 'ok'
                  ? 'border border-green-200 bg-green-50 text-green-700'
                  : 'border border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {msg.text}
            </div>
          )}
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-sm mb-1 text-gray-700">كود المندوب *</label>
              <input
                type="text"
                value={riderCode}
                onChange={(e) => setRiderCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-700">اسم المندوب *</label>
              <input
                type="text"
                value={riderName}
                onChange={(e) => setRiderName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-700">الزون *</label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              >
                <option value="">اختر الزون</option>
                {ZONE_OPTIONS.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-[#1e1e2f]">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-2 rounded-lg text-sm ${
                statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              الكل ({counts.all})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-2 rounded-lg text-sm ${
                statusFilter === 'pending'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              قيد الانتظار ({counts.pending})
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-3 py-2 rounded-lg text-sm ${
                statusFilter === 'approved'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              الموافق عليها ({counts.approved})
            </button>
            <button
              onClick={() => setStatusFilter('rejected')}
              className={`px-3 py-2 rounded-lg text-sm ${
                statusFilter === 'rejected' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              المرفوضة ({counts.rejected})
            </button>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-gray-500">جاري تحميل البيانات...</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-gray-500">لا توجد طلبات</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right py-3 px-4">المندوب</th>
                    <th className="text-right py-3 px-4">الزون</th>
                    <th className="text-right py-3 px-4">تاريخ الطلب</th>
                    <th className="text-right py-3 px-4">قرار المدير</th>
                    <th className="text-right py-3 px-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 px-4">
                        <div className="font-medium">{r.riderName}</div>
                        <div className="text-xs text-gray-500">{r.riderCode}</div>
                      </td>
                      <td className="py-3 px-4">{r.zone || '—'}</td>
                      <td className="py-3 px-4">{r.requestDate || '—'}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {r.approvalDate ? `${r.approvalDate} · ${r.approvedBy || ''}` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            r.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : r.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

