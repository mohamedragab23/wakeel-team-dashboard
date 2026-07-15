'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/ui-v2/Button';
import { authFetch } from '@/lib/authFetch';
import { usePageNotify } from '@/lib/usePageNotify';
import type { CommentCategory } from '@/lib/riderComments/types';
import { COMMENT_CATEGORY_LABELS_AR, COMMENT_CATEGORY_ICONS } from '@/lib/riderComments/types';

type Rider = {
  code: string;
  name: string;
  region: string;
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

export default function RiderCommentsPage() {
  const { setMessage } = usePageNotify();
  const [riders, setRiders] = useState<Rider[]>([]);
  const [recentComments, setRecentComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedRider, setSelectedRider] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<CommentCategory>('other');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [estimatedReturnDays, setEstimatedReturnDays] = useState('');
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadRiders();
    loadRecentComments();
  }, []);

  const loadRiders = async () => {
    try {
      const response = await authFetch('/api/riders');
      if (!response.ok) throw new Error('Failed to load riders');
      const data = await response.json();
      setRiders(data.riders || []);
    } catch (error) {
      console.error('Error loading riders:', error);
      setMessage('فشل تحميل قائمة المناديب', 'error');
    }
  };

  const loadRecentComments = async () => {
    try {
      setLoading(true);
      const response = await authFetch('/api/rider-comments');
      if (!response.ok) throw new Error('Failed to load comments');
      const data = await response.json();
      setRecentComments(data.comments || []);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRider || !category) {
      setMessage('يرجى اختيار المندوب والفئة', 'error');
      return;
    }

    const selectedRiderData = riders.find((r) => r.code === selectedRider);
    if (!selectedRiderData) {
      setMessage('المندوب غير موجود', 'error');
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        riderCode: selectedRider,
        riderName: selectedRiderData.name,
        date: selectedDate,
        category,
        expectedReturnDate: expectedReturnDate || undefined,
        estimatedReturnDays: estimatedReturnDays ? Number(estimatedReturnDays) : undefined,
        notes: notes.trim(),
      };

      const response = await authFetch('/api/rider-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add comment');
      }

      setMessage('✅ تم حفظ التعليق بنجاح', 'success');

      // Reset form
      setSelectedRider('');
      setCategory('other');
      setExpectedReturnDate('');
      setEstimatedReturnDays('');
      setNotes('');

      // Reload comments
      loadRecentComments();
    } catch (error) {
      console.error('Error adding comment:', error);
      setMessage(`فشل حفظ التعليق: ${error}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRiders = riders.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoryOptions: { value: CommentCategory; label: string; icon: string }[] = [
    { value: 'accident', label: COMMENT_CATEGORY_LABELS_AR.accident, icon: COMMENT_CATEGORY_ICONS.accident },
    { value: 'medical_leave', label: COMMENT_CATEGORY_LABELS_AR.medical_leave, icon: COMMENT_CATEGORY_ICONS.medical_leave },
    { value: 'family_emergency', label: COMMENT_CATEGORY_LABELS_AR.family_emergency, icon: COMMENT_CATEGORY_ICONS.family_emergency },
    { value: 'equipment_issue', label: COMMENT_CATEGORY_LABELS_AR.equipment_issue, icon: COMMENT_CATEGORY_ICONS.equipment_issue },
    { value: 'frequent_absences', label: COMMENT_CATEGORY_LABELS_AR.frequent_absences, icon: COMMENT_CATEGORY_ICONS.frequent_absences },
    { value: 'vacation', label: COMMENT_CATEGORY_LABELS_AR.vacation, icon: COMMENT_CATEGORY_ICONS.vacation },
    { value: 'poor_performance', label: COMMENT_CATEGORY_LABELS_AR.poor_performance, icon: COMMENT_CATEGORY_ICONS.poor_performance },
    { value: 'terminated', label: COMMENT_CATEGORY_LABELS_AR.terminated, icon: COMMENT_CATEGORY_ICONS.terminated },
    { value: 'other', label: COMMENT_CATEGORY_LABELS_AR.other, icon: COMMENT_CATEGORY_ICONS.other },
  ];

  const showReturnFields = category === 'accident' || category === 'medical_leave';

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#EAF0FF] mb-2">
              💬 التعليقات اليومية للمناديب
            </h1>
            <p className="text-[#94A3B8]">
              سجل حالة المناديب يومياً (غياب، حوادث، أعذار، إلخ) لتحليل أدق
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Add Comment Form */}
            <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6">
              <h2 className="text-xl font-semibold text-[#EAF0FF] mb-4">إضافة تعليق جديد</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">التاريخ</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Rider Selection */}
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">المندوب</label>
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الكود..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500 mb-2"
                  />
                  <select
                    value={selectedRider}
                    onChange={(e) => setSelectedRider(e.target.value)}
                    required
                    className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">-- اختر المندوب --</option>
                    {filteredRiders.map((rider) => (
                      <option key={rider.code} value={rider.code}>
                        {rider.name} ({rider.code}) - {rider.region}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">الفئة / السبب</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CommentCategory)}
                    required
                    className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                  >
                    {categoryOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.icon} {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Return Date (only for accidents/medical) */}
                {showReturnFields && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                        تاريخ العودة المتوقع (اختياري)
                      </label>
                      <input
                        type="date"
                        value={expectedReturnDate}
                        onChange={(e) => setExpectedReturnDate(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                        عدد الأيام المتوقعة (اختياري)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={estimatedReturnDays}
                        onChange={(e) => setEstimatedReturnDays(e.target.value)}
                        placeholder="مثال: 3 أيام"
                        className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">ملاحظات</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="اكتب ملاحظات إضافية هنا..."
                    className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500 resize-none"
                  />
                </div>

                {/* Submit */}
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? '⏳ جاري الحفظ...' : '💾 حفظ التعليق'}
                </Button>
              </form>
            </div>

            {/* Recent Comments */}
            <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6">
              <h2 className="text-xl font-semibold text-[#EAF0FF] mb-4">
                التعليقات الأخيرة ({recentComments.length})
              </h2>

              {loading ? (
                <p className="text-[#94A3B8] text-center py-8">⏳ جاري التحميل...</p>
              ) : recentComments.length === 0 ? (
                <p className="text-[#94A3B8] text-center py-8">لا توجد تعليقات بعد</p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {recentComments.slice(0, 20).map((comment) => {
                    const categoryOpt = categoryOptions.find((c) => c.value === comment.category);
                    return (
                      <div
                        key={comment.id}
                        className="rounded-lg border border-white/10 bg-[#1e293b] p-4"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-[#EAF0FF] font-semibold">{comment.riderName}</p>
                            <p className="text-xs text-[#64748B]">
                              {comment.riderCode} • {comment.date}
                            </p>
                          </div>
                          <span className="text-xl">{categoryOpt?.icon || '📝'}</span>
                        </div>
                        <p className="text-sm text-[#94A3B8] mb-2">
                          <strong>{categoryOpt?.label || comment.category}</strong>
                        </p>
                        {comment.expectedReturnDate && (
                          <p className="text-xs text-cyan-300 mb-1">
                            🔄 عودة متوقعة: {comment.expectedReturnDate}
                          </p>
                        )}
                        {comment.notes && (
                          <p className="text-sm text-[#CBD5E1] mt-2 italic">
                            "{comment.notes}"
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
            <h3 className="text-lg font-semibold text-cyan-300 mb-2">💡 أهمية التعليقات اليومية</h3>
            <ul className="space-y-2 text-sm text-[#94A3B8]">
              <li>
                ✅ <strong>تحليل أدق:</strong> معرفة السبب الحقيقي وراء غياب المندوب (حادث، إجازة، عذر...)
              </li>
              <li>
                ✅ <strong>توقع العودة:</strong> معرفة متى سيعود المناديب المصابون/المرضى
              </li>
              <li>
                ✅ <strong>تحذيرات مبكرة:</strong> اكتشاف المناديب الذين يأخذون إجازات متكررة
              </li>
              <li>
                ✅ <strong>قرارات أفضل:</strong> توصيات مبنية على أسباب حقيقية وليس مجرد أرقام
              </li>
              <li>
                🔒 <strong>سجل دائم:</strong> التعليقات لا تُحذف، مما يوفر سجلاً كاملاً لحالة كل مندوب
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
