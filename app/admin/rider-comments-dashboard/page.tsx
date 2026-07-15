'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { usePageNotify } from '@/lib/usePageNotify';
import type { CommentCategory } from '@/lib/riderComments/types';
import { COMMENT_CATEGORY_LABELS_AR, COMMENT_CATEGORY_ICONS } from '@/lib/riderComments/types';

type Comment = {
  id: string;
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  supervisorName: string;
  date: string;
  category: CommentCategory;
  expectedReturnDate?: string;
  estimatedReturnDays?: number;
  notes: string;
  createdAt: string;
};

type RiderCommentFrequency = {
  riderCode: string;
  riderName: string;
  supervisorName: string;
  categoryBreakdown: Record<CommentCategory, number>;
  totalComments: number;
  lastComment: string;
  mostFrequentCategory: CommentCategory;
};

export default function AdminRiderCommentsDashboard() {
  const notify = usePageNotify();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('all');

  useEffect(() => {
    loadComments();
  }, []);

  const loadComments = async () => {
    try {
      setLoading(true);
      let url = '/api/rider-comments';
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await authFetch(url);
      if (!response.ok) throw new Error('Failed to load comments');
      const data = await response.json();
      setComments(data.comments || []);
    } catch (error) {
      console.error('Error loading comments:', error);
      notify.error('فشل تحميل التعليقات');
    } finally {
      setLoading(false);
    }
  };

  // Calculate rider comment frequency
  const calculateFrequency = (): RiderCommentFrequency[] => {
    const frequencyMap = new Map<string, RiderCommentFrequency>();

    for (const comment of comments) {
      const key = comment.riderCode;
      
      if (!frequencyMap.has(key)) {
        frequencyMap.set(key, {
          riderCode: comment.riderCode,
          riderName: comment.riderName,
          supervisorName: comment.supervisorName,
          categoryBreakdown: {} as Record<CommentCategory, number>,
          totalComments: 0,
          lastComment: comment.date,
          mostFrequentCategory: comment.category,
        });
      }

      const freq = frequencyMap.get(key)!;
      freq.totalComments += 1;
      freq.categoryBreakdown[comment.category] = (freq.categoryBreakdown[comment.category] || 0) + 1;
      
      // Update last comment if newer
      if (comment.date > freq.lastComment) {
        freq.lastComment = comment.date;
      }
    }

    // Calculate most frequent category for each rider
    for (const freq of frequencyMap.values()) {
      let maxCount = 0;
      let mostFrequent: CommentCategory = 'other';
      
      for (const [category, count] of Object.entries(freq.categoryBreakdown)) {
        if (count > maxCount) {
          maxCount = count;
          mostFrequent = category as CommentCategory;
        }
      }
      
      freq.mostFrequentCategory = mostFrequent;
    }

    return Array.from(frequencyMap.values()).sort((a, b) => b.totalComments - a.totalComments);
  };

  const frequencyData = calculateFrequency();

  // Get unique supervisors for filter
  const supervisors = Array.from(
    new Set(comments.map((c) => c.supervisorName).filter(Boolean))
  );

  // Filter comments
  const filteredComments = comments.filter((c) => {
    if (selectedCategory !== 'all' && c.category !== selectedCategory) return false;
    if (selectedSupervisor !== 'all' && c.supervisorName !== selectedSupervisor) return false;
    return true;
  });

  // Category stats
  const categoryStats: Record<CommentCategory, number> = {} as Record<CommentCategory, number>;
  for (const comment of filteredComments) {
    categoryStats[comment.category] = (categoryStats[comment.category] || 0) + 1;
  }

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

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#EAF0FF] mb-2">
              💬 لوحة التعليقات اليومية - الأدمن
            </h1>
            <p className="text-[#94A3B8]">
              عرض شامل لكل التعليقات من جميع المشرفين مع حساب التكرار والتحليل
            </p>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 mb-6">
            <h2 className="text-xl font-semibold text-[#EAF0FF] mb-4">الفلاتر</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-2">من تاريخ</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-2">إلى تاريخ</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-2">الفئة</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">كل الفئات</option>
                  {categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.icon} {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-2">المشرف</label>
                <select
                  value={selectedSupervisor}
                  onChange={(e) => setSelectedSupervisor(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">كل المشرفين</option>
                  {supervisors.map((sup) => (
                    <option key={sup} value={sup}>
                      {sup}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={loadComments}
                disabled={loading}
                className="px-6 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-medium transition-colors"
              >
                {loading ? '⏳ جاري التحميل...' : '🔍 تطبيق الفلاتر'}
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
              <p className="text-xs text-[#94A3B8] mb-1">إجمالي التعليقات</p>
              <p className="text-3xl font-bold text-[#EAF0FF]">{filteredComments.length}</p>
            </div>
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <p className="text-xs text-[#94A3B8] mb-1">عدد المناديب</p>
              <p className="text-3xl font-bold text-cyan-300">{frequencyData.length}</p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-xs text-[#94A3B8] mb-1">عدد المشرفين</p>
              <p className="text-3xl font-bold text-amber-300">{supervisors.length}</p>
            </div>
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
              <p className="text-xs text-[#94A3B8] mb-1">متوسط التعليقات/مندوب</p>
              <p className="text-3xl font-bold text-green-300">
                {frequencyData.length > 0 ? (filteredComments.length / frequencyData.length).toFixed(1) : 0}
              </p>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 mb-6">
            <h2 className="text-xl font-semibold text-[#EAF0FF] mb-4">توزيع التعليقات حسب الفئة</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {categoryOptions.map((opt) => {
                const count = categoryStats[opt.value] || 0;
                return (
                  <div
                    key={opt.value}
                    className="rounded-lg border border-white/10 bg-[#1e293b] p-3 text-center"
                  >
                    <p className="text-2xl mb-1">{opt.icon}</p>
                    <p className="text-sm text-[#94A3B8] mb-1">{opt.label}</p>
                    <p className="text-xl font-bold text-[#EAF0FF]">{count}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rider Frequency Table */}
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 mb-6">
            <h2 className="text-xl font-semibold text-[#EAF0FF] mb-4">
              تكرار التعليقات لكل مندوب ({frequencyData.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-right p-3 text-[#94A3B8] font-medium">المندوب</th>
                    <th className="text-right p-3 text-[#94A3B8] font-medium">المشرف</th>
                    <th className="text-center p-3 text-[#94A3B8] font-medium">إجمالي التعليقات</th>
                    <th className="text-center p-3 text-[#94A3B8] font-medium">الفئة الأكثر</th>
                    <th className="text-center p-3 text-[#94A3B8] font-medium">آخر تعليق</th>
                    <th className="text-right p-3 text-[#94A3B8] font-medium">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {frequencyData.map((freq) => {
                    const mostFrequentOpt = categoryOptions.find((c) => c.value === freq.mostFrequentCategory);
                    return (
                      <tr key={freq.riderCode} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3 text-[#EAF0FF]">
                          <p className="font-semibold">{freq.riderName}</p>
                          <p className="text-xs text-[#64748B]">{freq.riderCode}</p>
                        </td>
                        <td className="p-3 text-[#94A3B8]">{freq.supervisorName}</td>
                        <td className="p-3 text-center">
                          <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">
                            {freq.totalComments}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-block px-3 py-1 rounded-full bg-white/5 text-[#EAF0FF]">
                            {mostFrequentOpt?.icon} {mostFrequentOpt?.label}
                          </span>
                        </td>
                        <td className="p-3 text-center text-[#94A3B8]">{freq.lastComment}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(freq.categoryBreakdown).map(([category, count]) => {
                              const cat = categoryOptions.find((c) => c.value === category);
                              return (
                                <span
                                  key={category}
                                  className="inline-block px-2 py-0.5 rounded text-xs bg-[#1e293b] border border-white/10 text-[#94A3B8]"
                                >
                                  {cat?.icon} {count}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Comments */}
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6">
            <h2 className="text-xl font-semibold text-[#EAF0FF] mb-4">
              أحدث التعليقات ({filteredComments.slice(0, 50).length} / {filteredComments.length})
            </h2>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredComments.slice(0, 50).map((comment) => {
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
                          {comment.riderCode} • {comment.date} • بواسطة {comment.supervisorName}
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
          </div>
        </div>
      </div>
    </Layout>
  );
}
