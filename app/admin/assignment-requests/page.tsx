'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface AssignmentRequest {
  id: number;
  supervisorCode: string;
  supervisorName: string;
  riderCode: string;
  riderName: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
  approvalDate: string;
  approvedBy: string;
}

export default function AssignmentRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: requests, isLoading, refetch } = useQuery({
    queryKey: ['assignment-requests', statusFilter],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const url = new URL('/api/assignment-requests', window.location.origin);
      if (statusFilter !== 'all') {
        url.searchParams.append('status', statusFilter);
      }
      
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? (data.data as AssignmentRequest[]) : [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/assignment-requests', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          requestId, 
          action: 'approve',
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الموافقة');
      return data;
    },
    onSuccess: async () => {
      // Clear all caches first
      queryClient.removeQueries({ queryKey: ['assignment-requests'] });
      queryClient.removeQueries({ queryKey: ['admin', 'riders'] });
      queryClient.removeQueries({ queryKey: ['riders'] });
      queryClient.removeQueries({ queryKey: ['supervisor-riders'] });
      
      // Invalidate admin dashboard queries to update pending counts
      queryClient.invalidateQueries({ queryKey: ['assignment-requests', 'pending'] });
      
      // Wait a bit for Google Sheets to update, then refetch with refresh=true
      setTimeout(async () => {
        // Refetch with refresh=true to bypass cache
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['assignment-requests'] }),
          queryClient.refetchQueries({ queryKey: ['admin', 'riders'] }),
        ]);
        
        // Also invalidate supervisor riders queries
        queryClient.invalidateQueries({ queryKey: ['riders'] });
        queryClient.invalidateQueries({ queryKey: ['supervisor-riders'] });
      }, 1500);
      
      alert('✅ تمت الموافقة على الطلب بنجاح. سيتم تعيين المندوب للمشرف تلقائياً.');
    },
    onError: (error: any) => {
      alert(`❌ خطأ: ${error.message || 'فشل الموافقة على الطلب'}`);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/assignment-requests', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId, action: 'reject' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الرفض');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-requests'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-requests', 'pending'] });
      alert('✅ تم رفض الطلب');
    },
    onError: (error: any) => {
      alert(`❌ خطأ: ${error.message || 'فشل رفض الطلب'}`);
    },
  });

  const pendingRequests = requests?.filter((r) => r.status === 'pending') || [];
  const approvedRequests = requests?.filter((r) => r.status === 'approved') || [];
  const rejectedRequests = requests?.filter((r) => r.status === 'rejected') || [];

  const pendingIds = new Set(pendingRequests.map((r) => r.id));
  const selectedPending = selectedIds.size > 0 && Array.from(selectedIds).some((id) => pendingIds.has(id));
  const isAllPendingSelected =
    pendingRequests.length > 0 &&
    pendingRequests.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (isAllPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingRequests.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds).filter((id) => pendingIds.has(id));
    if (ids.length === 0) return;
    if (!confirm(`موافقة على ${ids.length} طلب تعيين؟`)) return;
    setBulkLoading(true);
    try {
      const token = localStorage.getItem('token');
      for (const requestId of ids) {
        const res = await fetch('/api/assignment-requests', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ requestId, action: 'approve' }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'فشل الموافقة');
      }
      setSelectedIds(new Set());
      queryClient.removeQueries({ queryKey: ['assignment-requests'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-requests'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-requests', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'riders'] });
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      queryClient.invalidateQueries({ queryKey: ['supervisor-riders'] });
      setTimeout(() => queryClient.refetchQueries({ queryKey: ['assignment-requests'] }), 500);
      alert(`✅ تمت الموافقة على ${ids.length} طلب بنجاح.`);
    } catch (e: any) {
      alert(`❌ خطأ: ${e.message || 'فشل تنفيذ الموافقة'}`);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selectedIds).filter((id) => pendingIds.has(id));
    if (ids.length === 0) return;
    if (!confirm(`رفض ${ids.length} طلب؟`)) return;
    setBulkLoading(true);
    try {
      const token = localStorage.getItem('token');
      for (const requestId of ids) {
        const res = await fetch('/api/assignment-requests', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ requestId, action: 'reject' }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'فشل الرفض');
      }
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['assignment-requests'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-requests', 'pending'] });
      alert(`✅ تم رفض ${ids.length} طلب.`);
    } catch (e: any) {
      alert(`❌ خطأ: ${e.message || 'فشل تنفيذ الرفض'}`);
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">طلبات التعيين</h1>
          <p className="text-[rgba(234,240,255,0.70)]">إدارة طلبات تعيين المناديب للمشرفين</p>
        </div>

        {/* Status Filter */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              الكل ({requests?.length || 0})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                statusFilter === 'pending'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              قيد الانتظار ({pendingRequests.length})
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                statusFilter === 'approved'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              الموافق عليها ({approvedRequests.length})
            </button>
            <button
              onClick={() => setStatusFilter('rejected')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                statusFilter === 'rejected'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              المرفوضة ({rejectedRequests.length})
            </button>
          </div>
        </div>

        {/* Requests List */}
        {isLoading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">جاري تحميل البيانات...</p>
          </div>
        ) : requests && requests.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {selectedPending && (
              <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100 bg-gray-50">
                <span className="text-sm font-medium text-gray-700">
                  تم تحديد {Array.from(selectedIds).filter((id) => pendingIds.has(id)).length} طلب
                </span>
                <button
                  type="button"
                  onClick={handleBulkApprove}
                  disabled={bulkLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {bulkLoading ? 'جاري التنفيذ...' : 'موافقة على المحدد'}
                </button>
                <button
                  type="button"
                  onClick={handleBulkReject}
                  disabled={bulkLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  رفض المحدد
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
                >
                  إلغاء التحديد
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-gray-50">
                  <tr>
                    {pendingRequests.length > 0 && (
                      <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700 w-12">
                        <input
                          type="checkbox"
                          checked={isAllPendingSelected}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300"
                          title="تحديد الكل"
                        />
                      </th>
                    )}
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">المشرف</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">المندوب</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">تاريخ الطلب</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الحالة</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {requests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      {pendingRequests.length > 0 && (
                        <td className="py-4 px-6 text-sm w-12">
                          {request.status === 'pending' ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(request.id)}
                              onChange={() => toggleSelect(request.id)}
                              className="rounded border-gray-300"
                            />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      <td className="py-4 px-6 text-sm">
                        <div>
                          <p className="font-medium text-gray-800">{request.supervisorName}</p>
                          <p className="text-xs text-gray-500">{request.supervisorCode}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <div>
                          <p className="font-medium text-gray-800">{request.riderName}</p>
                          <p className="text-xs text-gray-500">{request.riderCode}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600">
                        {request.requestDate
                          ? new Date(request.requestDate).toLocaleDateString('ar-EG', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : '-'}
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            request.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : request.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {request.status === 'pending'
                            ? 'قيد الانتظار'
                            : request.status === 'approved'
                            ? 'موافق عليها'
                            : 'مرفوضة'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm">
                        {request.status === 'pending' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (confirm(`هل أنت متأكد من الموافقة على تعيين المندوب "${request.riderName}" للمشرف "${request.supervisorName}"؟`)) {
                                  approveMutation.mutate(request.id);
                                }
                              }}
                              disabled={approveMutation.isPending}
                              className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs font-medium disabled:opacity-50"
                            >
                              {approveMutation.isPending ? 'جاري...' : 'موافقة'}
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('هل أنت متأكد من رفض طلب التعيين؟')) {
                                  rejectMutation.mutate(request.id);
                                }
                              }}
                              disabled={rejectMutation.isPending}
                              className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-medium disabled:opacity-50"
                            >
                              {rejectMutation.isPending ? 'جاري...' : 'رفض'}
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">
                            {request.approvalDate && (
                              <p>
                                {new Date(request.approvalDate).toLocaleDateString('ar-EG', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </p>
                            )}
                            {request.approvedBy && <p className="mt-1">بواسطة: {request.approvedBy}</p>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
            <p className="text-gray-500 text-lg">لا توجد طلبات تعيين</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

