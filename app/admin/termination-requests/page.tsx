'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface TerminationRequest {
  id: number;
  supervisorCode: string;
  supervisorName: string;
  riderCode: string;
  riderName: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
  approvalDate: string;
  approvedBy: string;
}

export default function TerminationRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [approvalModal, setApprovalModal] = useState<{ show: boolean; requestId: number; riderCode: string; riderName: string } | null>(null);
  const [newSupervisorCode, setNewSupervisorCode] = useState<string>('');
  const [deleteRider, setDeleteRider] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkApprovalOpen, setBulkApprovalOpen] = useState(false);
  const [bulkNewSupervisorCode, setBulkNewSupervisorCode] = useState('');
  const [bulkDeleteRider, setBulkDeleteRider] = useState(false);
  const queryClient = useQueryClient();

  const { data: requests, isLoading, refetch } = useQuery({
    queryKey: ['termination-requests', statusFilter],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const url = new URL('/api/termination-requests', window.location.origin);
      if (statusFilter !== 'all') {
        url.searchParams.append('status', statusFilter);
      }
      
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? (data.data as TerminationRequest[]) : [];
    },
  });

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

  const approveMutation = useMutation({
    mutationFn: async ({ requestId, newSupervisorCode, deleteRider }: { requestId: number; newSupervisorCode?: string; deleteRider?: boolean }) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/termination-requests', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          requestId, 
          action: 'approve',
          newSupervisorCode: newSupervisorCode || undefined,
          deleteRider: deleteRider || false,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الموافقة');
      return data;
    },
    onSuccess: async () => {
      // Clear all caches first
      queryClient.removeQueries({ queryKey: ['termination-requests'] });
      queryClient.removeQueries({ queryKey: ['admin', 'riders'] });
      queryClient.removeQueries({ queryKey: ['riders'] });
      queryClient.removeQueries({ queryKey: ['supervisor-riders'] });
      
      setApprovalModal(null);
      setNewSupervisorCode('');
      setDeleteRider(false);
      
      // Wait a bit for Google Sheets to update, then refetch with refresh=true
      setTimeout(async () => {
        // Refetch with refresh=true to bypass cache
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['termination-requests'] }),
          queryClient.refetchQueries({ queryKey: ['admin', 'riders'] }),
        ]);
        
        // Also invalidate supervisor riders queries
        queryClient.invalidateQueries({ queryKey: ['riders'] });
        queryClient.invalidateQueries({ queryKey: ['supervisor-riders'] });
      }, 1500);
      
      alert('✅ تمت الموافقة على الطلب بنجاح. سيتم تحديث القوائم تلقائياً.');
    },
    onError: (error: any) => {
      alert(`❌ خطأ: ${error.message || 'فشل الموافقة على الطلب'}`);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/termination-requests', {
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
      queryClient.invalidateQueries({ queryKey: ['termination-requests'] });
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

  const handleBulkApproveWithOptions = async (newSupervisorCode: string, deleteRider: boolean) => {
    const ids = Array.from(selectedIds).filter((id) => pendingIds.has(id));
    if (ids.length === 0) return;
    if (deleteRider && !confirm(`⚠️ هل أنت متأكد من حذف ${ids.length} مندوب تماماً من النظام؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setBulkLoading(true);
    setBulkApprovalOpen(false);
    try {
      const token = localStorage.getItem('token');
      for (const requestId of ids) {
        const res = await fetch('/api/termination-requests', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            requestId,
            action: 'approve',
            newSupervisorCode: newSupervisorCode || undefined,
            deleteRider: !!deleteRider,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'فشل الموافقة');
      }
      setSelectedIds(new Set());
      setBulkNewSupervisorCode('');
      setBulkDeleteRider(false);
      queryClient.removeQueries({ queryKey: ['termination-requests'] });
      queryClient.invalidateQueries({ queryKey: ['termination-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'riders'] });
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      queryClient.invalidateQueries({ queryKey: ['supervisor-riders'] });
      setTimeout(() => queryClient.refetchQueries({ queryKey: ['termination-requests'] }), 500);
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
        const res = await fetch('/api/termination-requests', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ requestId, action: 'reject' }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'فشل الرفض');
      }
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['termination-requests'] });
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
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">طلبات الإقالة</h1>
          <p className="text-[rgba(234,240,255,0.70)]">إدارة طلبات إقالة المناديب من المشرفين</p>
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
                  onClick={() => {
                    setBulkNewSupervisorCode('');
                    setBulkDeleteRider(false);
                    setBulkApprovalOpen(true);
                  }}
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
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">السبب</th>
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
                      <td className="py-4 px-6 text-sm text-gray-600 max-w-xs">
                        <p className="truncate" title={request.reason}>
                          {request.reason}
                        </p>
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
                                setApprovalModal({ show: true, requestId: request.id, riderCode: request.riderCode, riderName: request.riderName });
                              }}
                              disabled={approveMutation.isPending}
                              className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs font-medium disabled:opacity-50"
                            >
                              {approveMutation.isPending ? 'جاري...' : 'موافقة'}
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('هل أنت متأكد من رفض طلب الإقالة؟')) {
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
            <p className="text-gray-500 text-lg">لا توجد طلبات إقالة</p>
          </div>
        )}

        {/* Bulk Approval Modal - نفس آلية الموافقة الفردية */}
        {bulkApprovalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">
                موافقة على الطلبات المحددة ({Array.from(selectedIds).filter((id) => pendingIds.has(id)).length} طلب)
              </h3>
              <p className="text-gray-600 mb-4">اختر نوع الموافقة المطبقة على جميع الطلبات المحددة:</p>
              <div className="space-y-4">
                <label className="flex items-center mb-2">
                  <input
                    type="radio"
                    name="bulk-approval-action"
                    checked={!bulkDeleteRider && !bulkNewSupervisorCode}
                    onChange={() => {
                      setBulkDeleteRider(false);
                      setBulkNewSupervisorCode('');
                    }}
                    className="mr-2"
                  />
                  <span>إزالة التعيين فقط (يبقى المندوب في النظام بدون مشرف)</span>
                </label>
                <div>
                  <label className="flex items-center mb-2">
                    <input
                      type="radio"
                      name="bulk-approval-action"
                      checked={!!bulkNewSupervisorCode && !bulkDeleteRider}
                      onChange={() => setBulkDeleteRider(false)}
                      className="mr-2"
                    />
                    <span>تعيين المناديب لمشرف آخر</span>
                  </label>
                  <select
                    value={bulkNewSupervisorCode}
                    onChange={(e) => {
                      setBulkNewSupervisorCode(e.target.value);
                      setBulkDeleteRider(false);
                    }}
                    className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    <option value="">اختر المشرف</option>
                    {supervisors.map((s: any, index: number) => (
                      <option key={`bulk-sup-${s.code}-${index}`} value={s.code}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center mb-2">
                  <input
                    type="radio"
                    name="bulk-approval-action"
                    checked={bulkDeleteRider}
                    onChange={() => {
                      setBulkDeleteRider(true);
                      setBulkNewSupervisorCode('');
                    }}
                    className="mr-2"
                  />
                  <span className="text-red-600">حذف المناديب تماماً من النظام</span>
                </label>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => {
                    if (bulkDeleteRider) {
                      if (!confirm('⚠️ هل أنت متأكد من حذف المناديب المحددين تماماً من النظام؟ لا يمكن التراجع عنه.')) return;
                    }
                    handleBulkApproveWithOptions(bulkNewSupervisorCode, bulkDeleteRider);
                  }}
                  disabled={bulkLoading}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkLoading ? 'جاري...' : 'تأكيد الموافقة'}
                </button>
                <button
                  onClick={() => {
                    setBulkApprovalOpen(false);
                    setBulkNewSupervisorCode('');
                    setBulkDeleteRider(false);
                  }}
                  disabled={bulkLoading}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Approval Modal (طلب واحد) */}
        {approvalModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">موافقة على طلب الإقالة</h3>
              <p className="text-gray-600 mb-4">
                المندوب: <strong>{approvalModal.riderName}</strong> ({approvalModal.riderCode})
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="flex items-center mb-2">
                    <input
                      type="radio"
                      name="approval-action"
                      checked={!deleteRider && !newSupervisorCode}
                      onChange={() => {
                        setDeleteRider(false);
                        setNewSupervisorCode('');
                      }}
                      className="mr-2"
                    />
                    <span>إزالة التعيين فقط (يبقى المندوب في النظام بدون مشرف)</span>
                  </label>
                </div>
                
                <div>
                  <label className="flex items-center mb-2">
                    <input
                      type="radio"
                      name="approval-action"
                      checked={!!newSupervisorCode && !deleteRider}
                      onChange={() => {
                        setDeleteRider(false);
                        // Don't clear newSupervisorCode here - let user select
                      }}
                      className="mr-2"
                    />
                    <span>تعيين المندوب لمشرف آخر</span>
                  </label>
                  {!deleteRider && (
                    <select
                      value={newSupervisorCode}
                      onChange={(e) => {
                        setNewSupervisorCode(e.target.value);
                        setDeleteRider(false);
                      }}
                      onClick={(e) => {
                        // Auto-select this radio when clicking select
                        setDeleteRider(false);
                      }}
                      className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">اختر المشرف</option>
                      {supervisors.map((s: any, index: number) => (
                        <option key={`supervisor-${s.code}-${index}`} value={s.code}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                
                <div>
                  <label className="flex items-center mb-2">
                    <input
                      type="radio"
                      name="approval-action"
                      checked={deleteRider}
                      onChange={() => {
                        setDeleteRider(true);
                        setNewSupervisorCode('');
                      }}
                      className="mr-2"
                    />
                    <span className="text-red-600">حذف المندوب تماماً من النظام</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => {
                    if (deleteRider) {
                      if (!confirm('⚠️ هل أنت متأكد من حذف المندوب تماماً من النظام؟ هذا الإجراء لا يمكن التراجع عنه.')) {
                        return;
                      }
                    }
                    if (!deleteRider && !newSupervisorCode) {
                      // Default: remove assignment only
                      approveMutation.mutate({
                        requestId: approvalModal.requestId,
                        newSupervisorCode: undefined,
                        deleteRider: false,
                      });
                    } else {
                      approveMutation.mutate({
                        requestId: approvalModal.requestId,
                        newSupervisorCode: newSupervisorCode || undefined,
                        deleteRider: deleteRider || undefined,
                      });
                    }
                  }}
                  disabled={approveMutation.isPending}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {approveMutation.isPending ? 'جاري...' : 'تأكيد الموافقة'}
                </button>
                <button
                  onClick={() => {
                    setApprovalModal(null);
                    setNewSupervisorCode('');
                    setDeleteRider(false);
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

