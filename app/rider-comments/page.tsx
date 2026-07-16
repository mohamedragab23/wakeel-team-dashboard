'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { usePageNotify } from '@/lib/usePageNotify';
import type { CommentCategory } from '@/lib/riderComments/types';
import { COMMENT_CATEGORY_LABELS_AR, COMMENT_CATEGORY_ICONS } from '@/lib/riderComments/types';

type Rider = {
  code: string;
  name: string;
  region: string;
  supervisorName?: string;
};

type Comment = {
  id: string;
  riderCode: string;
  riderName: string;
  date: string;
  category: CommentCategory;
  expectedReturnDate?: string;
  estimatedReturnDays?: number;
  notes: string;
  createdAt: string;
};

type QuickCommentState = {
  riderCode: string;
  category: CommentCategory;
  notes: string;
  expectedReturnDate: string;
  estimatedReturnDays: string;
};

export default function RiderCommentsPage() {
  const notify = usePageNotify();
  const [riders, setRiders] = useState<Rider[]>([]);
  const [recentComments, setRecentComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [quickComments, setQuickComments] = useState<Record<string, QuickCommentState>>({});
  const [submittingRider, setSubmittingRider] = useState<string | null>(null);

  const categoryOptions: { value: CommentCategory; label: string; icon: string }[] = [
    { value: 'working_normally', label: COMMENT_CATEGORY_LABELS_AR.working_normally, icon: COMMENT_CATEGORY_ICONS.working_normally },
    { value: 'vacation', label: COMMENT_CATEGORY_LABELS_AR.vacation, icon: COMMENT_CATEGORY_ICONS.vacation },
    { value: 'medical_leave', label: COMMENT_CATEGORY_LABELS_AR.medical_leave, icon: COMMENT_CATEGORY_ICONS.medical_leave },
    { value: 'accident', label: COMMENT_CATEGORY_LABELS_AR.accident, icon: COMMENT_CATEGORY_ICONS.accident },
    { value: 'family_emergency', label: COMMENT_CATEGORY_LABELS_AR.family_emergency, icon: COMMENT_CATEGORY_ICONS.family_emergency },
    { value: 'equipment_issue', label: COMMENT_CATEGORY_LABELS_AR.equipment_issue, icon: COMMENT_CATEGORY_ICONS.equipment_issue },
    { value: 'frequent_absences', label: COMMENT_CATEGORY_LABELS_AR.frequent_absences, icon: COMMENT_CATEGORY_ICONS.frequent_absences },
    { value: 'poor_performance', label: COMMENT_CATEGORY_LABELS_AR.poor_performance, icon: COMMENT_CATEGORY_ICONS.poor_performance },
    { value: 'terminated', label: COMMENT_CATEGORY_LABELS_AR.terminated, icon: COMMENT_CATEGORY_ICONS.terminated },
    { value: 'other', label: COMMENT_CATEGORY_LABELS_AR.other, icon: COMMENT_CATEGORY_ICONS.other },
  ];

  useEffect(() => {
    loadRiders();
    // Don't load all comments on mount - too slow!
    // loadRecentComments();
  }, []);

  const loadRiders = async () => {
    try {
      setLoading(true);
      console.log('[rider-comments] Loading riders...');
      const response = await authFetch('/api/riders');
      if (!response.ok) {
        console.error('[rider-comments] Failed to load riders:', response.status);
        throw new Error('Failed to load riders');
      }
      const data = await response.json();
      console.log('[rider-comments] Riders loaded:', data);
      
      // API returns { success: true, data: [...] }
      const ridersList = data.data || data.riders || [];
      setRiders(ridersList);
      console.log('[rider-comments] Riders count:', ridersList.length);
    } catch (error) {
      console.error('Error loading riders:', error);
      notify.error('فشل تحميل قائمة المناديب');
    } finally {
      setLoading(false);
    }
  };

  const loadRecentComments = async () => {
    // Only load comments for today to improve performance
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await authFetch(`/api/rider-comments?startDate=${today}&endDate=${today}`);
      if (!response.ok) {
        console.error('[rider-comments] Failed to load comments:', response.status);
        return; // Don't throw - comments are optional
      }
      const data = await response.json();
      setRecentComments(data.comments || []);
      console.log('[rider-comments] Today comments loaded:', data.comments?.length || 0);
    } catch (error) {
      console.error('Error loading comments:', error);
      // Don't show error - comments are not critical for page load
    }
  };

  const handleQuickComment = (riderCode: string, field: keyof QuickCommentState, value: string) => {
    setQuickComments((prev) => ({
      ...prev,
      [riderCode]: {
        ...prev[riderCode],
        riderCode,
        category: prev[riderCode]?.category || 'working_normally',
        notes: prev[riderCode]?.notes || '',
        expectedReturnDate: prev[riderCode]?.expectedReturnDate || '',
        estimatedReturnDays: prev[riderCode]?.estimatedReturnDays || '',
        [field]: value,
      },
    }));
  };

  const handleSubmitQuickComment = async (riderCode: string) => {
    const rider = riders.find((r) => r.code === riderCode);
    if (!rider) {
      notify.error('المندوب غير موجود');
      return;
    }

    const quickComment = quickComments[riderCode];
    if (!quickComment || !quickComment.category) {
      notify.error('يرجى اختيار الفئة');
      return;
    }

    try {
      setSubmittingRider(riderCode);

      const payload = {
        riderCode: rider.code,
        riderName: rider.name,
        date: selectedDate,
        category: quickComment.category,
        expectedReturnDate: quickComment.expectedReturnDate || undefined,
        estimatedReturnDays: quickComment.estimatedReturnDays ? Number(quickComment.estimatedReturnDays) : undefined,
        notes: quickComment.notes.trim() || '',
      };

      console.log('[rider-comments] Submitting:', payload);

      const response = await authFetch('/api/rider-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('[rider-comments] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'خطأ غير معروف' }));
        console.error('[rider-comments] Error:', errorData);
        
        // Special handling for 401 Unauthorized
        if (response.status === 401) {
          notify.error('⚠️ انتهت صلاحية الجلسة - يرجى تسجيل الدخول من جديد');
          // Redirect to home (login page) after 2 seconds
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
          return;
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      notify.success(`✅ تم حفظ تعليق ${rider.name}`);

      // Clear quick comment
      setQuickComments((prev) => {
        const updated = { ...prev };
        delete updated[riderCode];
        return updated;
      });

      // Reload comments
      loadRecentComments();
    } catch (error: any) {
      console.error('[rider-comments] Submit error:', error);
      notify.error(`فشل حفظ التعليق: ${error.message || 'خطأ غير معروف'}`);
    } finally {
      setSubmittingRider(null);
    }
  };

  const filteredRiders = riders.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showReturnFields = (riderCode: string) => {
    const category = quickComments[riderCode]?.category;
    // Show return date for all categories except "working normally"
    return category && category !== 'working_normally';
  };

  const getRiderRecentComment = (riderCode: string) => {
    return recentComments.find((c) => c.riderCode === riderCode);
  };

  const getRiderCommentCount = (riderCode: string) => {
    return recentComments.filter((c) => c.riderCode === riderCode).length;
  };

  const getRiderCategoryCount = (riderCode: string, category: CommentCategory) => {
    return recentComments.filter((c) => c.riderCode === riderCode && c.category === category).length;
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#EAF0FF] mb-2">
              💬 التعليقات اليومية للمناديب
            </h1>
            <p className="text-[#94A3B8]">
              سجل حالة كل مندوب يومياً بسرعة (غياب، حادث، إجازة، إلخ)
            </p>
          </div>

          {/* Date Selector */}
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-2">📅 التاريخ</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-2">🔍 بحث</label>
                <input
                  type="text"
                  placeholder="ابحث بالاسم أو الكود..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Riders Table */}
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6">
            <h2 className="text-xl font-semibold text-[#EAF0FF] mb-4">
              قائمة المناديب ({filteredRiders.length})
            </h2>

            {loading ? (
              <p className="text-center text-[#94A3B8] py-8">⏳ جاري التحميل...</p>
            ) : filteredRiders.length === 0 ? (
              <p className="text-center text-[#94A3B8] py-8">لا توجد مناديب</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-right p-3 text-[#94A3B8] font-medium">المندوب</th>
                      <th className="text-right p-3 text-[#94A3B8] font-medium">المنطقة</th>
                      <th className="text-right p-3 text-[#94A3B8] font-medium">الفئة</th>
                      <th className="text-right p-3 text-[#94A3B8] font-medium">ملاحظات</th>
                      <th className="text-center p-3 text-[#94A3B8] font-medium">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRiders.map((rider) => {
                      const recentComment = getRiderRecentComment(rider.code);
                      const commentCount = getRiderCommentCount(rider.code);
                      const quickComment = quickComments[rider.code];
                      const isSubmitting = submittingRider === rider.code;
                      const categoryCount = quickComment?.category 
                        ? getRiderCategoryCount(rider.code, quickComment.category)
                        : 0;

                      return (
                        <tr key={rider.code} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-3 text-[#EAF0FF]">
                            <p className="font-semibold">{rider.name}</p>
                            <p className="text-xs text-[#64748B]">{rider.code}</p>
                            {recentComment && (
                              <p className="text-xs text-cyan-300 mt-1">
                                آخر تعليق: {COMMENT_CATEGORY_ICONS[recentComment.category]}{' '}
                                {COMMENT_CATEGORY_LABELS_AR[recentComment.category]} ({recentComment.date})
                              </p>
                            )}
                            {commentCount > 0 && (
                              <p className="text-xs text-amber-300 mt-1">
                                📊 إجمالي التعليقات: {commentCount}
                              </p>
                            )}
                          </td>
                          <td className="p-3 text-[#94A3B8]">{rider.region}</td>
                          <td className="p-3">
                            <select
                              value={quickComment?.category || 'working_normally'}
                              onChange={(e) =>
                                handleQuickComment(rider.code, 'category', e.target.value as CommentCategory)
                              }
                              disabled={isSubmitting}
                              className="w-full px-3 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] text-sm focus:outline-none focus:border-cyan-500"
                            >
                              {categoryOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.icon} {opt.label}
                                </option>
                              ))}
                            </select>
                            {categoryCount > 0 && quickComment?.category !== 'working_normally' && (
                              <p className="text-xs text-red-300 mt-1">
                                ⚠️ تكرر {categoryCount} مرة
                              </p>
                            )}
                            {showReturnFields(rider.code) && (
                              <div className="mt-2 space-y-1">
                                <input
                                  type="date"
                                  value={quickComment?.expectedReturnDate || ''}
                                  onChange={(e) =>
                                    handleQuickComment(rider.code, 'expectedReturnDate', e.target.value)
                                  }
                                  placeholder="تاريخ العودة المتوقع"
                                  disabled={isSubmitting}
                                  className="w-full px-2 py-1 rounded bg-[#0f172a] border border-white/10 text-[#EAF0FF] text-xs focus:outline-none focus:border-cyan-500"
                                />
                                <input
                                  type="number"
                                  min="1"
                                  value={quickComment?.estimatedReturnDays || ''}
                                  onChange={(e) =>
                                    handleQuickComment(rider.code, 'estimatedReturnDays', e.target.value)
                                  }
                                  placeholder="عدد الأيام المتوقعة"
                                  disabled={isSubmitting}
                                  className="w-full px-2 py-1 rounded bg-[#0f172a] border border-white/10 text-[#EAF0FF] text-xs focus:outline-none focus:border-cyan-500"
                                />
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <textarea
                              value={quickComment?.notes || ''}
                              onChange={(e) => handleQuickComment(rider.code, 'notes', e.target.value)}
                              placeholder="ملاحظات (اختياري)"
                              disabled={isSubmitting}
                              rows={2}
                              className="w-full px-3 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] text-sm focus:outline-none focus:border-cyan-500 resize-none"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleSubmitQuickComment(rider.code)}
                              disabled={isSubmitting}
                              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                isSubmitting
                                  ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                                  : 'bg-cyan-500 hover:bg-cyan-600 text-white'
                              }`}
                            >
                              {isSubmitting ? '⏳' : '💾 حفظ'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-6 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
            <h3 className="text-lg font-semibold text-cyan-300 mb-2">💡 نصائح سريعة</h3>
            <ul className="space-y-2 text-sm text-[#94A3B8]">
              <li>
                ✅ <strong>شغال عادي:</strong> الافتراضي - اضغط "حفظ" مباشرة بدون ملاحظات
              </li>
              <li>
                ✅ <strong>حادث/إجازة/غياب:</strong> اختر الفئة المناسبة من القائمة
              </li>
              <li>
                ✅ <strong>تاريخ العودة:</strong> سيظهر تلقائياً لكل الفئات ما عدا "شغال عادي"
              </li>
              <li>
                ✅ <strong>ملاحظات:</strong> اختيارية - أضف تفاصيل إضافية إذا أردت
              </li>
              <li>
                ⚠️ <strong>مهم:</strong> إذا ظهر خطأ 401، قم بتسجيل الدخول من جديد
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
