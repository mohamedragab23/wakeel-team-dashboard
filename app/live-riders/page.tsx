'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import Card from '@/components/ui-v2/Card';
import Badge from '@/components/ui-v2/Badge';
import Button from '@/components/ui-v2/Button';
import { authFetch } from '@/lib/authFetch';
import { getStoredUser } from '@/lib/clientSession';
import LiveRidersKpiCards from '@/components/liveRiders/LiveRidersKpiCards';
import LiveRidersDonut from '@/components/liveRiders/LiveRidersDonut';
import LiveRidersTable from '@/components/liveRiders/LiveRidersTable';
import SupervisorSummaryTable from '@/components/liveRiders/SupervisorSummaryTable';
import LiveRiderDrawer from '@/components/liveRiders/LiveRiderDrawer';
import type { LiveRidersApiResponse, LiveRiderStatusBucket, LiveRiderWithAssignment } from '@/lib/roosterLive/types';

const REFRESH_INTERVAL_MS = 60_000;

const STATUS_FILTER_OPTIONS: { value: LiveRiderStatusBucket | 'all'; label: string }[] = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'online', label: 'متصل' },
  { value: 'busy', label: 'مشغول' },
  { value: 'on_break', label: 'استراحة' },
  { value: 'late', label: 'متأخر' },
  { value: 'offline', label: 'غير متصل' },
];

async function fetchLiveRiders(): Promise<LiveRidersApiResponse> {
  const res = await authFetch('/api/live-riders');
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'تعذر تحميل بيانات العمليات المباشرة');
  }
  return json as LiveRidersApiResponse;
}

async function fetchSupervisorSummary() {
  const res = await authFetch('/api/live-riders/supervisor-summary');
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'تعذر تحميل ملخص المشرفين');
  }
  return json;
}

export default function LiveRidersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LiveRiderStatusBucket | 'all'>('all');
  const [sortKey, setSortKey] = useState<'name' | 'wallet' | 'late' | 'breaks'>('name');
  const [selectedRider, setSelectedRider] = useState<LiveRiderWithAssignment | null>(null);
  const [viewMode, setViewMode] = useState<'riders' | 'supervisors'>('riders');
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  useState(() => {
    try {
      const user = getStoredUser();
      setIsAdmin(user?.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  });

  const { data, isLoading, isError, error, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['live-riders'],
    queryFn: fetchLiveRiders,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: REFRESH_INTERVAL_MS - 5_000,
    retry: 1,
  });

  const { data: supervisorData, isLoading: supervisorLoading, isFetching: supervisorFetching } = useQuery({
    queryKey: ['live-riders-supervisors'],
    queryFn: fetchSupervisorSummary,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: REFRESH_INTERVAL_MS - 5_000,
    retry: 1,
    enabled: isAdmin && viewMode === 'supervisors',
  });

  const filteredRiders = useMemo(() => {
    const all = data?.data ?? [];
    const term = search.trim().toLowerCase();
    let rows = all.filter((r) => {
      if (statusFilter !== 'all' && r.statusBucket !== statusFilter) return false;
      if (!term) return true;
      return r.riderName.toLowerCase().includes(term) || r.riderId.toLowerCase().includes(term);
    });

    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'wallet':
          return a.walletBalance - b.walletBalance;
        case 'late':
          return b.lateTimeSeconds - a.lateTimeSeconds;
        case 'breaks':
          return b.breaksCount - a.breaksCount;
        default:
          return a.riderName.localeCompare(b.riderName, 'ar');
      }
    });
    return rows;
  }, [data, search, statusFilter, sortKey]);

  const secondsSinceRefresh = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000));

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#EAF0FF]">العمليات المباشرة — Live 3PL</h1>
            <p className="text-sm text-[rgba(234,240,255,0.6)] mt-1">بيانات مباشرة من طلبات، تُحدَّث تلقائياً كل دقيقة تقريباً</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[rgba(234,240,255,0.6)]">
            {isFetching && <Badge variant="info">جارِ التحديث…</Badge>}
            {data?.stale && !isFetching && <Badge variant="warning">تحديث متأخر</Badge>}
            {data?.lastSyncAt && (
              <span>آخر مزامنة: {new Date(data.lastSyncAt).toLocaleTimeString('ar-EG')}</span>
            )}
            <span>· آخر عرض منذ {secondsSinceRefresh} ثانية</span>
          </div>
        </div>

        {isLoading && (
          <Card>
            <div className="py-10 text-center text-[rgba(234,240,255,0.6)]">جارِ تحميل بيانات العمليات المباشرة…</div>
          </Card>
        )}

        {isError && !isLoading && (
          <Card>
            <div className="py-10 text-center text-[#FB7185]">
              {(error as Error)?.message || 'حدث خطأ أثناء تحميل البيانات'}
            </div>
          </Card>
        )}

        {!isLoading && !isError && data && (
          <>
            {/* Admin view mode toggle */}
            {isAdmin && (
              <Card>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[rgba(234,240,255,0.7)]">عرض:</span>
                  <Button
                    variant={viewMode === 'riders' ? 'primary' : 'secondary'}
                    onClick={() => setViewMode('riders')}
                  >
                    المناديب الفردية
                  </Button>
                  <Button
                    variant={viewMode === 'supervisors' ? 'primary' : 'secondary'}
                    onClick={() => setViewMode('supervisors')}
                  >
                    ملخص المشرفين
                  </Button>
                </div>
              </Card>
            )}

            {viewMode === 'riders' && (
              <>
                <LiveRidersKpiCards kpis={data.kpis} loading={isFetching && !data} />

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <LiveRidersDonut title="توزيع الحالة" data={data.distributions.status} />
                  <LiveRidersDonut title="توزيع الرصيد" data={data.distributions.wallet} />
                  <LiveRidersDonut title="توزيع الاستراحات" data={data.distributions.breaks} />
                  <LiveRidersDonut title="توزيع التأخير" data={data.distributions.late} />
                </div>

                <Card>
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <input
                      type="text"
                      placeholder="بحث بالاسم أو الكود…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="flex-1 min-w-[200px] rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[rgba(234,240,255,0.4)] focus:outline-none focus:ring-2 focus:ring-[rgba(0,245,255,0.35)]"
                    />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as LiveRiderStatusBucket | 'all')}
                      className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[#EAF0FF] focus:outline-none focus:ring-2 focus:ring-[rgba(0,245,255,0.35)]"
                    >
                      {STATUS_FILTER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-[#0f1524]">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                      className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[#EAF0FF] focus:outline-none focus:ring-2 focus:ring-[rgba(0,245,255,0.35)]"
                    >
                      <option value="name" className="bg-[#0f1524]">ترتيب: الاسم</option>
                      <option value="wallet" className="bg-[#0f1524]">ترتيب: الرصيد (الأقل أولاً)</option>
                      <option value="late" className="bg-[#0f1524]">ترتيب: التأخير (الأعلى أولاً)</option>
                      <option value="breaks" className="bg-[#0f1524]">ترتيب: الاستراحات (الأعلى أولاً)</option>
                    </select>
                    <span className="text-xs text-[rgba(234,240,255,0.55)]">{filteredRiders.length} مندوب</span>
                  </div>

                  <LiveRidersTable riders={filteredRiders} onSelect={setSelectedRider} />
                </Card>
              </>
            )}

            {viewMode === 'supervisors' && (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-[#EAF0FF]">ملخص المشرفين</h2>
                  {supervisorFetching && <Badge variant="info">جارِ التحديث…</Badge>}
                </div>

                {supervisorLoading && (
                  <div className="py-10 text-center text-[rgba(234,240,255,0.6)]">جارِ تحميل ملخص المشرفين…</div>
                )}

                {!supervisorLoading && supervisorData && (
                  <SupervisorSummaryTable supervisors={supervisorData.data || []} />
                )}
              </Card>
            )}
          </>
        )}
      </div>

      <LiveRiderDrawer rider={selectedRider} onClose={() => setSelectedRider(null)} />
    </Layout>
  );
}
