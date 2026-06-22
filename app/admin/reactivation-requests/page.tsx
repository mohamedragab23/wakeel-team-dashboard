'use client';

import { authFetch } from '@/lib/authFetch';
import { useState } from 'react';
import Layout from '@/components/Layout';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/providers/ToastProvider';

interface ReactivationRequest {
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
}

export default function AdminReactivationRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>(
    'all'
  );
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['reactivation-requests-admin', statusFilter],
    queryFn: async () => {
      const url = new URL('/api/reactivation-requests', window.location.origin);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      const res = await authFetch(url.toString());
      const data = await res.json();
      return data.success ? (data.data as ReactivationRequest[]) : [];
    } });

  const handleDone = () => {
    queryClient.invalidateQueries({ queryKey: ['reactivation-requests-admin'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'riders'] });
    queryClient.invalidateQueries({ queryKey: ['riders'] });
    queryClient.invalidateQueries({ queryKey: ['performance'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const approveMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await authFetch('/api/reactivation-requests', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action: 'approve' }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الموافقة');
      return data;
    },
    onSuccess: () => {
      handleDone();
      showSuccess('تمت الموافقة على إعادة التفعيل');
    },
    onError: (e: any) => showError(e.message || 'فشل الموافقة') });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await authFetch('/api/reactivation-requests', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action: 'reject' }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الرفض');
      return data;
    },
    onSuccess: () => {
      handleDone();
      showSuccess('تم رفض الطلب');
    },
    onError: (e: any) => showError(e.message || 'فشل الرفض') });

  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">طلبات إعادة التفعيل</h1>
          <p className="text-[rgba(234,240,255,0.70)]">
            عند الموافقة يتم إعادة تعيين/إضافة المندوب للمشرف تلقائياً.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded-lg ${
                statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              الكل ({counts.all})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-4 py-2 rounded-lg ${
                statusFilter === 'pending'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              قيد الانتظار ({counts.pending})
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-4 py-2 rounded-lg ${
                statusFilter === 'approved'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              الموافق عليها ({counts.approved})
            </button>
            <button
              onClick={() => setStatusFilter('rejected')}
              className={`px-4 py-2 rounded-lg ${
                statusFilter === 'rejected' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              المرفوضة ({counts.rejected})
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center text-gray-600">
            جاري تحميل البيانات...
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center text-gray-600">
            لا توجد طلبات إعادة تفعيل
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right py-4 px-6">المشرف</th>
                    <th className="text-right py-4 px-6">المندوب</th>
                    <th className="text-right py-4 px-6">الزون</th>
                    <th className="text-right py-4 px-6">تاريخ الطلب</th>
                    <th className="text-right py-4 px-6">الحالة</th>
                    <th className="text-right py-4 px-6">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {requests.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="py-4 px-6">
                        <div className="font-medium text-gray-800">{r.supervisorName}</div>
                        <div className="text-xs text-gray-500">{r.supervisorCode}</div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-medium text-gray-800">{r.riderName}</div>
                        <div className="text-xs text-gray-500">{r.riderCode}</div>
                      </td>
                      <td className="py-4 px-6 text-gray-700">{r.zone || '—'}</td>
                      <td className="py-4 px-6 text-gray-600">{r.requestDate || '—'}</td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            r.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : r.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {r.status === 'pending'
                            ? 'قيد الانتظار'
                            : r.status === 'approved'
                            ? 'موافق عليها'
                            : 'مرفوضة'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {r.status === 'pending' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    `الموافقة على إعادة تفعيل "${r.riderName}" للمشرف "${r.supervisorName}"؟`
                                  )
                                ) {
                                  approveMutation.mutate(r.id);
                                }
                              }}
                              className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs"
                              disabled={approveMutation.isPending}
                            >
                              موافقة
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('هل أنت متأكد من رفض الطلب؟')) {
                                  rejectMutation.mutate(r.id);
                                }
                              }}
                              className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs"
                              disabled={rejectMutation.isPending}
                            >
                              رفض
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">
                            {r.approvalDate ? `${r.approvalDate} · ${r.approvedBy || ''}` : '—'}
                          </div>
                        )}
                      </td>
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

