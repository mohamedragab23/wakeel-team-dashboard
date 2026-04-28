'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import DashboardStats from '@/components/DashboardStats';
import PerformanceChart from '@/components/PerformanceChart';
import TopRidersTable from '@/components/TopRidersTable';
import { StatsSkeleton, TableSkeleton } from '@/components/SkeletonLoader';
import TopRidersMiniChart from '@/components/TopRidersMiniChart';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';
import Tabs, { type TabItem } from '@/components/ui-v2/Tabs';
import { v2CssVars } from '@/theme/tokens';

interface DashboardData {
  totalHours: number;
  totalOrders: number;
  totalAbsences: number;
  totalBreaks: number;
  avgAcceptance: number;
  lastUploadDate: string;
  targetHours: number;
  targetAchievement: number;
  topRiders: Array<{
    name: string;
    orders: number;
    hours: number;
    acceptance: number;
  }>;
}

export default function DashboardPage() {
  const useNewUi = process.env.NEXT_PUBLIC_DASHBOARD_UI_V2 !== '0';

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [riderCode, setRiderCode] = useState('');
  const [riderName, setRiderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [tab, setTab] = useState<'overview' | 'assignment'>('overview');

  const tabItems: Array<TabItem<'overview' | 'assignment'>> = [
    { value: 'overview', label: 'لوحة التحكم' },
    { value: 'assignment', label: 'طلبات التعيين' },
  ];

  useEffect(() => {
    fetchDashboardData();
    fetchPendingRequestsCount();
  }, []);

  const fetchPendingRequestsCount = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/assignment-requests?status=pending', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setPendingRequestsCount(data.data.length);
      }
    } catch (err) {
      // Silently fail - not critical
    }
  };

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/dashboard', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setDashboardData(data.data);
      } else {
        setError(data.error || 'فشل تحميل البيانات');
      }
    } catch (err) {
      setError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAssignmentMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/assignment-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          riderCode: riderCode.trim(),
          riderName: riderName.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAssignmentMessage({ type: 'success', text: '✅ تم إرسال طلب التعيين بنجاح. سيتم إشعار المدير بالموافقة.' });
        setRiderCode('');
        setRiderName('');
        setShowAssignmentForm(false);
        fetchPendingRequestsCount(); // Refresh count
        setTimeout(() => setAssignmentMessage(null), 5000);
      } else {
        setAssignmentMessage({ type: 'error', text: `❌ ${data.error || 'فشل إرسال الطلب'}` });
      }
    } catch (err) {
      setAssignmentMessage({ type: 'error', text: '❌ حدث خطأ في الاتصال بالخادم' });
    } finally {
      setSubmitting(false);
    }
  };

  const renderLegacy = () => {
    if (loading) {
      return (
        <Layout>
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">لوحة التحكم</h1>
              <p className="text-gray-600">نظرة عامة على الأداء والإحصائيات</p>
            </div>
            <StatsSkeleton />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              </div>
              <TableSkeleton />
            </div>
          </div>
        </Layout>
      );
    }

    if (error) {
      return (
        <Layout>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        </Layout>
      );
    }

    return (
      <Layout>
        <div className="space-y-6 min-w-0">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2 break-words">لوحة التحكم</h1>
            <p className="text-gray-600 text-sm sm:text-base break-words">نظرة عامة على الأداء والإحصائيات</p>
          </div>

          {/* Assignment Request Form */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-w-0">
            <div className="p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-800 break-words">إضافة تعيين جديد</h2>
                  <p className="text-sm text-gray-600 mt-1 break-words">أضف مندوب جديد واطلب تعيينه لك</p>
                  {pendingRequestsCount > 0 && (
                    <p className="text-sm text-yellow-600 mt-1 font-medium">
                      لديك {pendingRequestsCount} طلب تعيين قيد الانتظار
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowAssignmentForm(!showAssignmentForm)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  {showAssignmentForm ? 'إخفاء' : 'إضافة طلب تعيين'}
                </button>
              </div>

              {assignmentMessage && (
                <div
                  className={`mb-4 p-3 rounded-lg ${
                    assignmentMessage.type === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {assignmentMessage.text}
                </div>
              )}

              {showAssignmentForm && (
                <form onSubmit={handleSubmitAssignment} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        كود المندوب *
                      </label>
                      <input
                        type="text"
                        value={riderCode}
                        onChange={(e) => setRiderCode(e.target.value)}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="مثال: RDR-001"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        اسم المندوب *
                      </label>
                      <input
                        type="text"
                        value={riderName}
                        onChange={(e) => setRiderName(e.target.value)}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="مثال: أحمد محمد"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAssignmentForm(false);
                        setRiderCode('');
                        setRiderName('');
                        setAssignmentMessage(null);
                      }}
                      className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {dashboardData && (
            <>
              {/* Last Upload Date Banner */}
              {dashboardData.lastUploadDate && (
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100 text-sm">بيانات آخر يوم تم رفعه</p>
                      <p className="text-2xl font-bold">
                        {new Date(dashboardData.lastUploadDate).toLocaleDateString('ar-EG', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className="text-5xl opacity-80">📅</div>
                  </div>
                </div>
              )}

              {/* Target Achievement Card */}
              {dashboardData.targetHours > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">تحقيق الهدف اليومي</h3>
                  <div className="flex items-center gap-6">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">الساعات الفعلية: {dashboardData.totalHours.toFixed(1)}</span>
                        <span className="text-gray-600">الهدف: {dashboardData.targetHours} ساعة</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                        <div 
                          className={`h-4 rounded-full transition-all duration-500 ${
                            dashboardData.targetAchievement >= 100 ? 'bg-green-500' : 
                            dashboardData.targetAchievement >= 75 ? 'bg-blue-500' : 
                            dashboardData.targetAchievement >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(dashboardData.targetAchievement, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className={`text-3xl font-bold ${
                      dashboardData.targetAchievement >= 100 ? 'text-green-600' : 
                      dashboardData.targetAchievement >= 75 ? 'text-blue-600' : 
                      dashboardData.targetAchievement >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {dashboardData.targetAchievement.toFixed(0)}%
                    </div>
                  </div>
                </div>
              )}

              <DashboardStats data={dashboardData} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PerformanceChart />
                <TopRidersTable topRiders={dashboardData.topRiders} />
              </div>
            </>
          )}
        </div>
      </Layout>
    );
  };

  if (!useNewUi) return renderLegacy();

  if (loading) {
    return (
      <Layout>
        <div style={v2CssVars()} className="space-y-6 text-[#EAF0FF]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">لوحة التحكم</h1>
            <p className="text-[rgba(234,240,255,0.70)]">نظرة عامة على الأداء والإحصائيات</p>
          </div>
          <StatsSkeleton />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="الأداء" subtitle="جاري التحميل...">
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--v2-accent-cyan)]"></div>
              </div>
            </Card>
            <TableSkeleton />
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div style={v2CssVars()} className="text-[#EAF0FF]">
          <div className="border border-[rgba(251,113,133,0.35)] bg-[rgba(251,113,133,0.10)] text-[#FB7185] px-4 py-3 rounded-[var(--v2-radius-lg)]">
            {error}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={v2CssVars()} className="space-y-5 sm:space-y-6 min-w-0 text-[#EAF0FF]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold mb-1 break-words">لوحة التحكم</h1>
              <p className="text-[rgba(234,240,255,0.70)] text-sm sm:text-base break-words">نظرة عامة على الأداء والإحصائيات</p>
            </div>
            <Tabs items={tabItems} value={tab} onChange={setTab} />
          </div>
        </div>

        {tab === 'assignment' && (
          <Card
            title="إضافة تعيين جديد"
            subtitle={
              pendingRequestsCount > 0
                ? `لديك ${pendingRequestsCount} طلب تعيين قيد الانتظار`
                : 'أضف مندوب جديد واطلب تعيينه لك'
            }
            rightSlot={
              <Button variant="primary" onClick={() => setShowAssignmentForm(!showAssignmentForm)}>
                {showAssignmentForm ? 'إخفاء' : 'إضافة طلب تعيين'}
              </Button>
            }
          >
            {assignmentMessage && (
              <div
                className={`mb-4 p-3 rounded-[var(--v2-radius-lg)] border ${
                  assignmentMessage.type === 'success'
                    ? 'border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.10)] text-[#34D399]'
                    : 'border-[rgba(251,113,133,0.35)] bg-[rgba(251,113,133,0.10)] text-[#FB7185]'
                }`}
              >
                {assignmentMessage.text}
              </div>
            )}

            {showAssignmentForm && (
              <form onSubmit={handleSubmitAssignment} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[rgba(234,240,255,0.75)] mb-2">
                      كود المندوب *
                    </label>
                    <input
                      type="text"
                      value={riderCode}
                      onChange={(e) => setRiderCode(e.target.value)}
                      required
                      className="w-full h-10 px-4 rounded-[var(--v2-radius-lg)] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[#EAF0FF] placeholder:text-[rgba(234,240,255,0.45)] outline-none focus:ring-2 focus:ring-[rgba(0,245,255,0.25)]"
                      placeholder="مثال: RDR-001"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[rgba(234,240,255,0.75)] mb-2">
                      اسم المندوب *
                    </label>
                    <input
                      type="text"
                      value={riderName}
                      onChange={(e) => setRiderName(e.target.value)}
                      required
                      className="w-full h-10 px-4 rounded-[var(--v2-radius-lg)] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[#EAF0FF] placeholder:text-[rgba(234,240,255,0.45)] outline-none focus:ring-2 focus:ring-[rgba(0,245,255,0.25)]"
                      placeholder="مثال: أحمد محمد"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={submitting} variant="primary">
                    {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowAssignmentForm(false);
                      setRiderCode('');
                      setRiderName('');
                      setAssignmentMessage(null);
                    }}
                  >
                    إلغاء
                  </Button>
                </div>
              </form>
            )}
          </Card>
        )}

        {tab === 'overview' && dashboardData && (
          <>
            {/* Last Upload Date Banner */}
            {dashboardData.lastUploadDate && (
              <div className="rounded-[var(--v2-radius-xl)] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] shadow-[var(--v2-shadow-soft)] overflow-hidden backdrop-blur-md">
                <div className="p-4 sm:p-5 bg-gradient-to-l from-[rgba(0,245,255,0.18)] via-[rgba(168,85,247,0.16)] to-transparent">
                  <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[rgba(234,240,255,0.70)] text-sm">بيانات آخر يوم تم رفعه</p>
                    <p className="text-lg sm:text-2xl font-extrabold text-[#EAF0FF] mt-1">
                      {new Date(dashboardData.lastUploadDate).toLocaleDateString('ar-EG', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  <div className="text-5xl opacity-80">📅</div>
                </div>
                </div>
              </div>
            )}

            {/* Target Achievement Card */}
            {dashboardData.targetHours > 0 && (
              <Card title="تحقيق الهدف اليومي">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                  <div className="flex-1">
                    <div className="flex flex-wrap justify-between text-sm mb-2 gap-2">
                      <span className="text-[rgba(234,240,255,0.70)]">
                        الساعات الفعلية:{' '}
                        <span className="text-[#EAF0FF] font-semibold">{dashboardData.totalHours.toFixed(1)}</span>
                      </span>
                      <span className="text-[rgba(234,240,255,0.70)]">
                        الهدف:{' '}
                        <span className="text-[#EAF0FF] font-semibold">{dashboardData.targetHours}</span> ساعة
                      </span>
                    </div>
                    <div className="w-full bg-[rgba(255,255,255,0.10)] rounded-full h-4 overflow-hidden border border-[rgba(255,255,255,0.10)]">
                      <div 
                        className="h-4 rounded-full transition-all duration-500 bg-gradient-to-l from-[color:var(--v2-accent-cyan)] to-[color:var(--v2-accent-purple)]"
                        style={{ width: `${Math.min(dashboardData.targetAchievement, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-[#EAF0FF]">
                    {dashboardData.targetAchievement.toFixed(0)}%
                  </div>
                </div>
              </Card>
            )}

            <DashboardStats data={dashboardData} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PerformanceChart />
              <div className="space-y-3">
                <TopRidersTable topRiders={dashboardData.topRiders} />
                {dashboardData.topRiders?.length > 0 && (
                  <Card title="مقارنة أفضل المناديب" subtitle="الطلبات مقابل الساعات (من نفس البيانات المعروضة)">
                    <TopRidersMiniChart topRiders={dashboardData.topRiders} />
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

