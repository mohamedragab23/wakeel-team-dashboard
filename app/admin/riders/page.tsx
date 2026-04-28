'use client';

import { useState, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ExcelUpload from '@/components/ExcelUpload';
import {
  RidersExcelColumnMenu,
  defaultTextFilter,
  defaultNumFilter,
  defaultAbsenceFilter,
  type TextFilterState,
  type NumFilterState,
  type AbsenceFilterState,
} from '@/components/RidersExcelColumnMenu';
import {
  applyAdminPerfFilters,
  ADMIN_PERF_NUM_KEYS,
  type AdminPerfFilters,
  type AdminPerfNumKey,
  type AdminPerfSort,
} from '@/lib/adminRidersPerformanceTableFilter';

interface Rider {
  code: string;
  name: string;
  region: string;
  supervisorCode: string;
  supervisorName?: string;
  phone?: string;
  joinDate?: string;
  status?: string;
}

interface RiderPerformanceRow {
  code: string;
  name: string;
  region?: string;
  supervisorCode?: string;
  supervisorName?: string;
  hours: number;
  break: number;
  delay: number;
  absence: string;
  orders: number;
  acceptance: number;
  debt: number;
  date: string;
  workDays: number;
}

export default function AdminRidersPage() {
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [perfStart, setPerfStart] = useState(todayIso);
  const [perfEnd, setPerfEnd] = useState(todayIso);

  const [perfFilters, setPerfFilters] = useState<AdminPerfFilters>(() => ({
    code: defaultTextFilter(),
    name: defaultTextFilter(),
    supervisor: defaultTextFilter(),
    region: defaultTextFilter(),
    date: defaultTextFilter(),
    workDays: defaultNumFilter(),
    hours: defaultNumFilter(),
    break: defaultNumFilter(),
    delay: defaultNumFilter(),
    orders: defaultNumFilter(),
    acceptance: defaultNumFilter(),
    debt: defaultNumFilter(),
    absence: defaultAbsenceFilter(),
  }));
  const [perfSort, setPerfSort] = useState<AdminPerfSort>({ col: null, dir: 'asc' });
  const [perfOpenMenu, setPerfOpenMenu] = useState<string | null>(null);

  const setPerfNumFilter = useCallback((key: AdminPerfNumKey, f: NumFilterState) => {
    setPerfFilters((prev) => {
      const next: AdminPerfFilters = { ...prev, [key]: f } as AdminPerfFilters;
      if (f.op === 'top10' || f.op === 'bottom10') {
        for (const k of ADMIN_PERF_NUM_KEYS) {
          if (k === key) continue;
          const other = next[k];
          if (other.op === 'top10' || other.op === 'bottom10') {
            next[k] = defaultNumFilter();
          }
        }
      }
      return next;
    });
  }, []);

  const clearPerfFilters = () => {
    setPerfFilters({
      code: defaultTextFilter(),
      name: defaultTextFilter(),
      supervisor: defaultTextFilter(),
      region: defaultTextFilter(),
      date: defaultTextFilter(),
      workDays: defaultNumFilter(),
      hours: defaultNumFilter(),
      break: defaultNumFilter(),
      delay: defaultNumFilter(),
      orders: defaultNumFilter(),
      acceptance: defaultNumFilter(),
      debt: defaultNumFilter(),
      absence: defaultAbsenceFilter(),
    });
    setPerfSort({ col: null, dir: 'asc' });
    setPerfOpenMenu(null);
  };

  const perfSortDirFor = (col: string): 'asc' | 'desc' | null =>
    perfSort.col === col ? perfSort.dir : null;

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRider, setEditingRider] = useState<Rider | null>(null);
  const [formData, setFormData] = useState<Partial<Rider>>({
    code: '',
    name: '',
    region: '',
    supervisorCode: '',
    phone: '',
    status: 'نشط',
  });

  const queryClient = useQueryClient();

  const { data: riders = [], isLoading: ridersLoading } = useQuery({
    queryKey: ['admin', 'riders'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      // Add timestamp to force refresh when needed
      const res = await fetch(`/api/admin/riders?refresh=true&t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? data.data : [];
    },
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache
    refetchOnMount: true, // Always refetch on mount
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

  const {
    data: perfRows = [],
    isLoading: perfLoading,
    isFetching: perfFetching,
    error: perfError,
  } = useQuery({
    queryKey: ['admin', 'riders-performance', perfStart, perfEnd],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const url = new URL('/api/admin/riders-performance', window.location.origin);
      url.searchParams.set('startDate', perfStart);
      url.searchParams.set('endDate', perfEnd);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'فشل تحميل أداء المناديب');
      }
      return data.data as RiderPerformanceRow[];
    },
    enabled: Boolean(perfStart && perfEnd),
  });

  const filteredPerfRows = useMemo(
    () => applyAdminPerfFilters(perfRows, perfFilters, perfSort),
    [perfRows, perfFilters, perfSort]
  );

  const addMutation = useMutation({
    mutationFn: async (rider: Rider) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/riders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(rider),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'riders'] });
      setShowAddModal(false);
      setFormData({ code: '', name: '', region: '', supervisorCode: '', phone: '', status: 'نشط' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ code, ...updates }: Partial<Rider> & { code: string }) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/riders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code, ...updates }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'riders'] });
      setEditingRider(null);
      setFormData({ code: '', name: '', region: '', supervisorCode: '', phone: '', status: 'نشط' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (code: string) => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/riders?code=${code}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'riders'] });
    },
  });

  const handleEdit = (rider: Rider) => {
    setEditingRider(rider);
    setFormData({
      code: rider.code,
      name: rider.name,
      region: rider.region,
      supervisorCode: rider.supervisorCode,
      phone: rider.phone || '',
      status: rider.status || 'نشط',
    });
  };

  const handleDelete = (code: string) => {
    if (confirm('هل أنت متأكد من إزالة تعيين هذا المندوب من المشرف؟')) {
      deleteMutation.mutate(code);
    }
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRider) {
      updateMutation.mutate(formData as Rider);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate(formData as Rider);
  };

  if (ridersLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 min-w-0">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-[#EAF0FF] mb-2 break-words">إدارة المناديب</h1>
            <p className="text-[rgba(234,240,255,0.70)] text-sm sm:text-base break-words">إضافة وتعيين المناديب للمشرفين</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm sm:text-base shrink-0"
          >
            + إضافة مندوب
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-[#1e1e2f]">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">أداء المناديب (جميع المشرفين)</h2>
          <p className="text-sm text-gray-600 mb-4">
            نفس أعمدة أداء المشرف: اختر الفترة لعرض التجميع اليومي لكل المناديب مع المشرف المسؤول.
          </p>
          <div className="flex flex-wrap gap-4 items-end mb-4">
            <div>
              <label htmlFor="admin-perf-start" className="block text-sm font-medium text-gray-700 mb-1">
                من تاريخ
              </label>
              <input
                id="admin-perf-start"
                type="date"
                value={perfStart}
                onChange={(e) => setPerfStart(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label htmlFor="admin-perf-end" className="block text-sm font-medium text-gray-700 mb-1">
                إلى تاريخ
              </label>
              <input
                id="admin-perf-end"
                type="date"
                value={perfEnd}
                onChange={(e) => setPerfEnd(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            {perfFetching && !perfLoading && (
              <span className="text-sm text-gray-500">جاري التحديث...</span>
            )}
            <button
              type="button"
              onClick={clearPerfFilters}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              title="مسح فلاتر/فرز جدول الأداء"
            >
              مسح فلاتر الأداء
            </button>
          </div>
          {perfError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {(perfError as Error).message}
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">الكود</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'code'}
                        onOpen={() => setPerfOpenMenu('code')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="text"
                        textFilter={perfFilters.code}
                        onTextChange={(f: TextFilterState) => setPerfFilters((p) => ({ ...p, code: f }))}
                        onSortAsc={() => {
                          setPerfSort({ col: 'code', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'code', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('code')}
                        ariaLabel="فلتر وفرز كود المندوب"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 min-w-[160px] align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">الاسم</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'name'}
                        onOpen={() => setPerfOpenMenu('name')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="text"
                        textFilter={perfFilters.name}
                        onTextChange={(f: TextFilterState) => setPerfFilters((p) => ({ ...p, name: f }))}
                        onSortAsc={() => {
                          setPerfSort({ col: 'name', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'name', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('name')}
                        ariaLabel="فلتر وفرز اسم المندوب"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 min-w-[140px] align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">المشرف</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'supervisor'}
                        onOpen={() => setPerfOpenMenu('supervisor')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="text"
                        textFilter={perfFilters.supervisor}
                        onTextChange={(f: TextFilterState) => setPerfFilters((p) => ({ ...p, supervisor: f }))}
                        onSortAsc={() => {
                          setPerfSort({ col: 'supervisor', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'supervisor', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('supervisor')}
                        ariaLabel="فلتر وفرز المشرف"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">المنطقة</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'region'}
                        onOpen={() => setPerfOpenMenu('region')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="text"
                        textFilter={perfFilters.region}
                        onTextChange={(f: TextFilterState) => setPerfFilters((p) => ({ ...p, region: f }))}
                        onSortAsc={() => {
                          setPerfSort({ col: 'region', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'region', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('region')}
                        ariaLabel="فلتر وفرز المنطقة"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">الفترة</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'date'}
                        onOpen={() => setPerfOpenMenu('date')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="text"
                        textFilter={perfFilters.date}
                        onTextChange={(f: TextFilterState) => setPerfFilters((p) => ({ ...p, date: f }))}
                        onSortAsc={() => {
                          setPerfSort({ col: 'date', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'date', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('date')}
                        ariaLabel="فلتر وفرز الفترة"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 whitespace-nowrap align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">أيام العمل</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'workDays'}
                        onOpen={() => setPerfOpenMenu('workDays')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="number"
                        numFilter={perfFilters.workDays}
                        onNumChange={(f: NumFilterState) => setPerfNumFilter('workDays', f)}
                        onSortAsc={() => {
                          setPerfSort({ col: 'workDays', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'workDays', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('workDays')}
                        ariaLabel="فلتر وفرز أيام العمل"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">ساعات</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'hours'}
                        onOpen={() => setPerfOpenMenu('hours')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="number"
                        numFilter={perfFilters.hours}
                        onNumChange={(f: NumFilterState) => setPerfNumFilter('hours', f)}
                        onSortAsc={() => {
                          setPerfSort({ col: 'hours', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'hours', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('hours')}
                        ariaLabel="فلتر وفرز الساعات"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">بريك</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'break'}
                        onOpen={() => setPerfOpenMenu('break')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="number"
                        numFilter={perfFilters.break}
                        onNumChange={(f: NumFilterState) => setPerfNumFilter('break', f)}
                        onSortAsc={() => {
                          setPerfSort({ col: 'break', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'break', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('break')}
                        ariaLabel="فلتر وفرز البريك"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">تأخير</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'delay'}
                        onOpen={() => setPerfOpenMenu('delay')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="number"
                        numFilter={perfFilters.delay}
                        onNumChange={(f: NumFilterState) => setPerfNumFilter('delay', f)}
                        onSortAsc={() => {
                          setPerfSort({ col: 'delay', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'delay', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('delay')}
                        ariaLabel="فلتر وفرز التأخير"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">غياب</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'absence'}
                        onOpen={() => setPerfOpenMenu('absence')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="absence"
                        absenceFilter={perfFilters.absence}
                        onAbsenceChange={(f: AbsenceFilterState) => setPerfFilters((p) => ({ ...p, absence: f }))}
                        onSortAsc={() => {
                          setPerfSort({ col: 'absence', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'absence', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('absence')}
                        ariaLabel="فلتر وفرز الغياب"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">طلبات</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'orders'}
                        onOpen={() => setPerfOpenMenu('orders')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="number"
                        numFilter={perfFilters.orders}
                        onNumChange={(f: NumFilterState) => setPerfNumFilter('orders', f)}
                        onSortAsc={() => {
                          setPerfSort({ col: 'orders', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'orders', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('orders')}
                        ariaLabel="فلتر وفرز الطلبات"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">قبول %</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'acceptance'}
                        onOpen={() => setPerfOpenMenu('acceptance')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="number"
                        numFilter={perfFilters.acceptance}
                        onNumChange={(f: NumFilterState) => setPerfNumFilter('acceptance', f)}
                        onSortAsc={() => {
                          setPerfSort({ col: 'acceptance', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'acceptance', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('acceptance')}
                        ariaLabel="فلتر وفرز القبول"
                      />
                    </div>
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-700 align-bottom">
                    <div className="flex items-end justify-end gap-1.5">
                      <span className="pb-0.5">مديونية</span>
                      <RidersExcelColumnMenu
                        isOpen={perfOpenMenu === 'debt'}
                        onOpen={() => setPerfOpenMenu('debt')}
                        onClose={() => setPerfOpenMenu(null)}
                        variant="number"
                        numFilter={perfFilters.debt}
                        onNumChange={(f: NumFilterState) => setPerfNumFilter('debt', f)}
                        onSortAsc={() => {
                          setPerfSort({ col: 'debt', dir: 'asc' });
                          setPerfOpenMenu(null);
                        }}
                        onSortDesc={() => {
                          setPerfSort({ col: 'debt', dir: 'desc' });
                          setPerfOpenMenu(null);
                        }}
                        onClearSort={() => setPerfSort({ col: null, dir: 'asc' })}
                        sortDirection={perfSortDirFor('debt')}
                        ariaLabel="فلتر وفرز المديونية"
                      />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {perfLoading ? (
                  <tr>
                    <td colSpan={13} className="py-10 text-center text-gray-500">
                      جاري تحميل الأداء...
                    </td>
                  </tr>
                ) : filteredPerfRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-10 text-center text-gray-500">
                      لا توجد بيانات مطابقة للفلاتر في هذه الفترة
                    </td>
                  </tr>
                ) : (
                  filteredPerfRows.map((r, i) => (
                    <tr key={`perf-${r.code}-${i}`} className="hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-800">{r.code}</td>
                      <td className="py-2 px-3 text-gray-800 font-medium break-words">{r.name}</td>
                      <td className="py-2 px-3 text-gray-600">
                        {r.supervisorCode && r.supervisorCode.trim() !== '' ? (
                          <>
                            {r.supervisorName || '—'} <span className="text-gray-400">({r.supervisorCode})</span>
                          </>
                        ) : (
                          <span className="text-gray-400 italic">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-gray-600">{r.region || '—'}</td>
                      <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.date}</td>
                      <td className="py-2 px-3 font-medium tabular-nums">{r.workDays ?? 0}</td>
                      <td className="py-2 px-3 tabular-nums">{(r.hours || 0).toFixed(1)}</td>
                      <td className="py-2 px-3 tabular-nums">{(r.break || 0).toFixed(1)}</td>
                      <td className="py-2 px-3 tabular-nums">{(r.delay || 0).toFixed(1)}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                            r.absence === 'نعم' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {r.absence}
                        </span>
                      </td>
                      <td className="py-2 px-3 tabular-nums">{r.orders}</td>
                      <td className="py-2 px-3 tabular-nums">{(r.acceptance || 0).toFixed(1)}%</td>
                      <td className="py-2 px-3 tabular-nums">{(r.debt || 0).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 text-[#1e1e2f]">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">إضافة مندوب واحد</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="rider-code" className="block text-sm font-medium text-gray-700 mb-2">كود المندوب *</label>
                <input
                  id="rider-code"
                  name="rider-code"
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                />
              </div>
              <div>
                <label htmlFor="rider-name" className="block text-sm font-medium text-gray-700 mb-2">الاسم *</label>
                <input
                  id="rider-name"
                  name="rider-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                />
              </div>
              <div>
                <label htmlFor="rider-region" className="block text-sm font-medium text-gray-700 mb-2">المنطقة</label>
                <input
                  id="rider-region"
                  name="rider-region"
                  type="text"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label htmlFor="rider-supervisor" className="block text-sm font-medium text-gray-700 mb-2">المشرف *</label>
                <select
                  id="rider-supervisor"
                  name="rider-supervisor"
                  value={formData.supervisorCode}
                  onChange={(e) => setFormData({ ...formData, supervisorCode: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                >
                  <option value="">اختر المشرف</option>
                  {supervisors.map((s: any, index: number) => (
                    <option key={`supervisor-${s.code}-${index}`} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="rider-phone" className="block text-sm font-medium text-gray-700 mb-2">الهاتف</label>
                <input
                  id="rider-phone"
                  name="rider-phone"
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                إضافة
              </button>
            </form>
          </div>

          <ExcelUpload
            type="riders"
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['admin', 'riders'] });
            }}
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden text-[#1e1e2f]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الكود</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700 min-w-[240px]">الاسم</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">المنطقة</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">المشرف</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الحالة</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {riders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      لا توجد مناديب
                    </td>
                  </tr>
                ) : (
                  riders
                    .filter((rider: Rider) => {
                      // Filter out deleted riders (those with empty code or marked as deleted)
                      if (!rider.code || rider.code.trim() === '') return false;
                      // Show all riders for admin (including unassigned ones)
                      return true;
                    })
                    .map((rider: Rider, index: number) => (
                    <tr key={`rider-${rider.code}-${index}`} className="hover:bg-gray-50">
                      <td className="py-4 px-6 text-sm text-gray-800">{rider.code}</td>
                      <td className="py-4 px-6 text-sm text-gray-800 font-medium whitespace-normal break-words">{rider.name}</td>
                      <td className="py-4 px-6 text-sm text-gray-600">{rider.region}</td>
                      <td className="py-4 px-6 text-sm text-gray-600">
                        {rider.supervisorCode && rider.supervisorCode.trim() !== '' && 
                         !['لم يتم التعيين', 'غير معروف', 'غير معين'].some(text => 
                           rider.supervisorCode?.toLowerCase().includes(text.toLowerCase())) ? (
                          <>
                            {rider.supervisorName || 'غير معروف'} ({rider.supervisorCode})
                          </>
                        ) : (
                          <span className="text-gray-400 italic">لم يتم التعيين</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            rider.status === 'نشط'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {rider.status || 'نشط'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleEdit(rider)}
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs"
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => handleDelete(rider.code)}
                            className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs"
                          >
                            إزالة التعيين
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Modal */}
        {editingRider && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-bold text-gray-800 mb-4">تعديل المندوب</h3>
              <form onSubmit={handleUpdateSubmit} className="space-y-4">
                <div>
                  <label htmlFor="edit-rider-code" className="block text-sm font-medium text-gray-700 mb-2">كود المندوب</label>
                  <input
                    id="edit-rider-code"
                    name="edit-rider-code"
                    type="text"
                    value={formData.code}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500"
                  />
                </div>
                <div>
                  <label htmlFor="edit-rider-name" className="block text-sm font-medium text-gray-700 mb-2">الاسم *</label>
                  <input
                    id="edit-rider-name"
                    name="edit-rider-name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-rider-region" className="block text-sm font-medium text-gray-700 mb-2">المنطقة</label>
                  <input
                    id="edit-rider-region"
                    name="edit-rider-region"
                    type="text"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="edit-rider-supervisor" className="block text-sm font-medium text-gray-700 mb-2">المشرف</label>
                  <select
                    id="edit-rider-supervisor"
                    name="edit-rider-supervisor"
                    value={formData.supervisorCode || ''}
                    onChange={(e) => setFormData({ ...formData, supervisorCode: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    <option value="">-- اختر المشرف --</option>
                    {supervisors.map((sup: any, index: number) => (
                      <option key={`supervisor-${sup.code}-${index}`} value={sup.code}>
                        {sup.name} ({sup.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-rider-phone" className="block text-sm font-medium text-gray-700 mb-2">الهاتف</label>
                  <input
                    id="edit-rider-phone"
                    name="edit-rider-phone"
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRider(null);
                      setFormData({ code: '', name: '', region: '', supervisorCode: '', phone: '', status: 'نشط' });
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-400 transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

