'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminPermissionAllowed } from '@/lib/adminPermissions';

type Tab = 'delivery' | 'return' | 'summary';

interface DeliveryReq {
  id: number;
  supervisorCode: string;
  supervisorName: string;
  riderCode: string;
  riderName: string;
  zone: string;
  deliveryType: string;
  motorcyclePouch: number;
  bicyclePouch: number;
  tshirt: number;
  jacket: number;
  helmet: number;
  photoData: string;
  status: string;
  requestDate: string;
  approvalDate: string;
  approvedBy: string;
  rejectReason: string;
}

interface ReturnReq {
  id: number;
  supervisorCode: string;
  supervisorName: string;
  riderCode: string;
  riderName: string;
  zone: string;
  motorcyclePouch: number;
  bicyclePouch: number;
  tshirt: number;
  jacket: number;
  helmet: number;
  status: string;
  requestDate: string;
  approvalDate: string;
  approvedBy: string;
  rejectReason: string;
}

export default function AdminEquipmentRequestsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [authChecked, setAuthChecked] = useState(false);
  /** موافقة/رفض فقط؛ العرض لكل المديرين */
  const [canApprove, setCanApprove] = useState(false);
  const [tab, setTab] = useState<Tab>('delivery');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      router.replace('/');
      return;
    }
    try {
      const u = JSON.parse(userStr) as { role?: string; permissions?: string };
      if (u.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }
      setCanApprove(adminPermissionAllowed(u.permissions, 'equipment'));
    } catch {
      router.replace('/');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  const deliveriesQuery = useQuery({
    queryKey: ['equipment-deliveries', statusFilter],
    enabled: authChecked,
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const url = new URL('/api/equipment-deliveries', window.location.origin);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل التحميل');
      return data.data as DeliveryReq[];
    },
  });

  const returnsQuery = useQuery({
    queryKey: ['equipment-returns', statusFilter],
    enabled: authChecked,
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const url = new URL('/api/equipment-returns', window.location.origin);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل التحميل');
      return data.data as ReturnReq[];
    },
  });

  const allDeliveriesQuery = useQuery({
    queryKey: ['equipment-deliveries', 'all-summary'],
    enabled: authChecked && tab === 'summary',
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/equipment-deliveries?status=', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as DeliveryReq[];
    },
  });

  const allReturnsQuery = useQuery({
    queryKey: ['equipment-returns', 'all-summary'],
    enabled: authChecked && tab === 'summary',
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/equipment-returns?status=', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as ReturnReq[];
    },
  });

  const approveDel = useMutation({
    mutationFn: async ({ id, action, rejectReason }: { id: number; action: 'approve' | 'reject'; rejectReason?: string }) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/equipment-deliveries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: id, action, rejectReason }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-pending-count'] });
    },
  });

  const approveRet = useMutation({
    mutationFn: async ({ id, action, rejectReason }: { id: number; action: 'approve' | 'reject'; rejectReason?: string }) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/equipment-returns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: id, action, rejectReason }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-returns'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-pending-count'] });
    },
  });

  const summaryRows = useMemo(() => {
    const d = allDeliveriesQuery.data || [];
    const r = allReturnsQuery.data || [];
    const map = new Map<
      string,
      { name: string; deliveriesApproved: number; returnsApproved: number; pendingD: number; pendingR: number }
    >();
    const bump = (code: string, name: string) => {
      if (!map.has(code)) {
        map.set(code, { name, deliveriesApproved: 0, returnsApproved: 0, pendingD: 0, pendingR: 0 });
      }
      return map.get(code)!;
    };
    for (const x of d) {
      const row = bump(x.supervisorCode, x.supervisorName);
      if (x.status === 'approved') row.deliveriesApproved += 1;
      if (x.status === 'pending') row.pendingD += 1;
    }
    for (const x of r) {
      const row = bump(x.supervisorCode, x.supervisorName);
      if (x.status === 'approved') row.returnsApproved += 1;
      if (x.status === 'pending') row.pendingR += 1;
    }
    return Array.from(map.entries()).map(([code, v]) => ({ code, ...v }));
  }, [allDeliveriesQuery.data, allReturnsQuery.data]);

  if (!authChecked) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center text-[#EAF0FF]">
        جاري التحميل...
      </div>
    );
  }

  const deliveries = deliveriesQuery.data || [];
  const returns = returnsQuery.data || [];

  return (
    <Layout>
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-semibold text-[#EAF0FF]">طلبات المعدات (تسليم / استرجاع)</h1>
          <p className="text-[rgba(234,240,255,0.65)] text-sm mt-1">
            الموافقة على التسليم تخصم من المخزون الرئيسي؛ الموافقة على الاسترجاع تضيف إليه.
          </p>
        </div>

        {!canApprove && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-100 px-4 py-3 text-sm">
            وضع الاطلاع فقط: لعرض الطلبات والتفاصيل لجميع المديرين. لتمكين أزرار الموافقة والرفض أضف{' '}
            <strong>equipment</strong> أو <strong>all</strong> في عمود صلاحيات الأدمن ثم سجّل الدخول من جديد.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(['delivery', 'return', 'summary'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-[color:var(--v2-accent-cyan)] text-[#05070D]'
                  : 'bg-white/5 text-[#EAF0FF] hover:bg-white/10'
              }`}
            >
              {t === 'delivery' ? 'تسليم المعدات' : t === 'return' ? 'استرجاع المعدات' : 'ملخص المشرفين'}
            </button>
          ))}
        </div>

        {tab !== 'summary' && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-[rgba(234,240,255,0.7)]">الحالة:</span>
            {(['pending', 'all', 'approved', 'rejected'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-md text-xs ${
                  statusFilter === s
                    ? 'bg-purple-500/30 text-purple-100'
                    : 'bg-white/5 text-[rgba(234,240,255,0.8)]'
                }`}
              >
                {s === 'all' ? 'الكل' : s === 'pending' ? 'معلق' : s === 'approved' ? 'موافق' : 'مرفوض'}
              </button>
            ))}
          </div>
        )}

        {tab === 'delivery' && (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            {deliveriesQuery.isLoading ? (
              <p className="p-4 text-[#EAF0FF]">جاري التحميل...</p>
            ) : (
              <table className="min-w-full text-sm text-right text-[#EAF0FF]">
                <thead className="bg-white/5">
                  <tr>
                    <th className="p-2">المشرف</th>
                    <th className="p-2">المندوب</th>
                    <th className="p-2">الزون</th>
                    <th className="p-2">النوع</th>
                    <th className="p-2">كميات</th>
                    <th className="p-2">الحالة</th>
                    <th className="p-2">صورة</th>
                    <th className="p-2">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((row) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="p-2 whitespace-nowrap">
                        {row.supervisorName}
                        <div className="text-xs opacity-70">{row.supervisorCode}</div>
                      </td>
                      <td className="p-2">
                        {row.riderName}
                        <div className="text-xs opacity-70">{row.riderCode}</div>
                      </td>
                      <td className="p-2">{row.zone}</td>
                      <td className="p-2">{row.deliveryType}</td>
                      <td className="p-2 text-xs">
                        م:{row.motorcyclePouch} ع:{row.bicyclePouch} ت:{row.tshirt} ج:{row.jacket} خ:
                        {row.helmet}
                      </td>
                      <td className="p-2">{row.status}</td>
                      <td className="p-2">
                        {row.photoData ? (
                          <a
                            href={row.photoData.startsWith('data:') ? row.photoData : `#`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 underline text-xs"
                            onClick={(e) => {
                              if (!row.photoData.startsWith('data:')) e.preventDefault();
                            }}
                          >
                            معاينة
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {row.status === 'pending' && canApprove && (
                          <div className="flex gap-1 flex-wrap">
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-emerald-600 text-white text-xs"
                              disabled={approveDel.isPending}
                              onClick={() =>
                                approveDel.mutate(
                                  { id: row.id, action: 'approve' },
                                  {
                                    onError: (e: Error) => alert(e.message),
                                    onSuccess: () => alert('تمت الموافقة'),
                                  }
                                )
                              }
                            >
                              موافقة
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-red-600 text-white text-xs"
                              disabled={approveDel.isPending}
                              onClick={() => {
                                const reason = prompt('سبب الرفض (اختياري)') || '';
                                approveDel.mutate(
                                  { id: row.id, action: 'reject', rejectReason: reason },
                                  {
                                    onError: (e: Error) => alert(e.message),
                                    onSuccess: () => alert('تم الرفض'),
                                  }
                                );
                              }}
                            >
                              رفض
                            </button>
                          </div>
                        )}
                        {row.status === 'pending' && !canApprove && (
                          <span className="text-xs text-amber-200/90">معلق — يحتاج صلاحية معالجة</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!deliveriesQuery.isLoading && deliveries.length === 0 && (
              <p className="p-4 text-[rgba(234,240,255,0.6)]">لا توجد طلبات.</p>
            )}
          </div>
        )}

        {tab === 'return' && (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            {returnsQuery.isLoading ? (
              <p className="p-4 text-[#EAF0FF]">جاري التحميل...</p>
            ) : (
              <table className="min-w-full text-sm text-right text-[#EAF0FF]">
                <thead className="bg-white/5">
                  <tr>
                    <th className="p-2">المشرف</th>
                    <th className="p-2">المندوب</th>
                    <th className="p-2">الزون</th>
                    <th className="p-2">كميات</th>
                    <th className="p-2">الحالة</th>
                    <th className="p-2">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((row) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="p-2 whitespace-nowrap">
                        {row.supervisorName}
                        <div className="text-xs opacity-70">{row.supervisorCode}</div>
                      </td>
                      <td className="p-2">
                        {row.riderName}
                        <div className="text-xs opacity-70">{row.riderCode}</div>
                      </td>
                      <td className="p-2">{row.zone}</td>
                      <td className="p-2 text-xs">
                        م:{row.motorcyclePouch} ع:{row.bicyclePouch} ت:{row.tshirt} ج:{row.jacket} خ:
                        {row.helmet}
                      </td>
                      <td className="p-2">{row.status}</td>
                      <td className="p-2 whitespace-nowrap">
                        {row.status === 'pending' && canApprove && (
                          <div className="flex gap-1 flex-wrap">
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-emerald-600 text-white text-xs"
                              disabled={approveRet.isPending}
                              onClick={() =>
                                approveRet.mutate(
                                  { id: row.id, action: 'approve' },
                                  {
                                    onError: (e: Error) => alert(e.message),
                                    onSuccess: () => alert('تمت الموافقة'),
                                  }
                                )
                              }
                            >
                              موافقة
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-red-600 text-white text-xs"
                              disabled={approveRet.isPending}
                              onClick={() => {
                                const reason = prompt('سبب الرفض (اختياري)') || '';
                                approveRet.mutate(
                                  { id: row.id, action: 'reject', rejectReason: reason },
                                  {
                                    onError: (e: Error) => alert(e.message),
                                    onSuccess: () => alert('تم الرفض'),
                                  }
                                );
                              }}
                            >
                              رفض
                            </button>
                          </div>
                        )}
                        {row.status === 'pending' && !canApprove && (
                          <span className="text-xs text-amber-200/90">معلق — يحتاج صلاحية معالجة</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!returnsQuery.isLoading && returns.length === 0 && (
              <p className="p-4 text-[rgba(234,240,255,0.6)]">لا توجد طلبات.</p>
            )}
          </div>
        )}

        {tab === 'summary' && (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            {allDeliveriesQuery.isLoading || allReturnsQuery.isLoading ? (
              <p className="p-4 text-[#EAF0FF]">جاري التحميل...</p>
            ) : (
              <table className="min-w-full text-sm text-right text-[#EAF0FF]">
                <thead className="bg-white/5">
                  <tr>
                    <th className="p-2">كود المشرف</th>
                    <th className="p-2">الاسم</th>
                    <th className="p-2">تسليمات موافق</th>
                    <th className="p-2">استرجاع موافق</th>
                    <th className="p-2">معلق تسليم</th>
                    <th className="p-2">معلق استرجاع</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((s) => (
                    <tr key={s.code} className="border-t border-white/10">
                      <td className="p-2">{s.code}</td>
                      <td className="p-2">{s.name}</td>
                      <td className="p-2">{s.deliveriesApproved}</td>
                      <td className="p-2">{s.returnsApproved}</td>
                      <td className="p-2">{s.pendingD}</td>
                      <td className="p-2">{s.pendingR}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {summaryRows.length === 0 && !allDeliveriesQuery.isLoading && (
              <p className="p-4 text-[rgba(234,240,255,0.6)]">لا بيانات بعد.</p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
