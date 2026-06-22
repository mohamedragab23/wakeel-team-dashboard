'use client';

import { authFetch } from '@/lib/authFetch';
import { useEffect, useState } from 'react';
import Button from '@/components/ui-v2/Button';
import type { Candidate } from '@/lib/recruitment/types';
import { CONTACT_STATUS_VALUES, HIRING_DECISION_VALUES } from '@/lib/recruitment/types';

type Props = {
  candidate: Candidate | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF]';

export default function ContactLogModal({ candidate, open, onClose, onSaved }: Props) {
  const [contactStatus, setContactStatus] = useState<Candidate['contactStatus']>('تم التواصل');
  const [contactDate, setContactDate] = useState(new Date().toISOString().slice(0, 10));
  const [contactReply, setContactReply] = useState('');
  const [hiringDecision, setHiringDecision] = useState<Candidate['hiringDecision']>('قيد المراجعة');
  const [notHiredReason, setNotHiredReason] = useState('');
  const [lecturePlannedDate, setLecturePlannedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !candidate) return;
    setContactStatus('تم التواصل');
    setContactDate(new Date().toISOString().slice(0, 10));
    setContactReply('');
    setHiringDecision('قيد المراجعة');
    setNotHiredReason('');
    setLecturePlannedDate('');
    setNotes('');
    setError('');
  }, [candidate, open]);

  if (!open || !candidate) return null;

  const submit = async () => {
    if ((contactStatus === 'تم التواصل' || contactStatus === 'تم الرد') && !contactReply.trim()) {
      setError('اكتب رد المرشح بعد التواصل');
      return;
    }
    if ((contactStatus === 'تم التواصل' || contactStatus === 'تم الرد') && hiringDecision === 'قيد المراجعة') {
      setError('حدد هل المرشح هيشتغل أو لن يشتغل');
      return;
    }
    if (hiringDecision === 'لن يشتغل' && !notHiredReason.trim()) {
      setError('اكتب سبب عدم التشغيل');
      return;
    }
    if (hiringDecision === 'هيشتغل' && !lecturePlannedDate) {
      setError('حدد تاريخ المحاضرة');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`/api/recruitment/candidates/${candidate.id}/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactStatus,
          contactDate,
          contactReply,
          hiringDecision,
          notHiredReason,
          lecturePlannedDate,
          notes }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل التسجيل');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0a0e18] border border-[rgba(255,255,255,0.12)] rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-6">
        <h2 className="text-xl font-bold mb-2">تسجيل تواصل</h2>
        <p className="text-sm text-[rgba(234,240,255,0.7)] mb-4">
          {candidate.fullName} — {candidate.phone}
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-[rgba(234,240,255,0.65)]">نتيجة المكالمة</span>
            <select
              className={inputClass + ' mt-1'}
              value={contactStatus}
              onChange={(e) => setContactStatus(e.target.value as Candidate['contactStatus'])}
            >
              {CONTACT_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-[rgba(234,240,255,0.65)]">تاريخ التواصل</span>
            <input
              type="date"
              className={inputClass + ' mt-1'}
              value={contactDate}
              onChange={(e) => setContactDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs text-[rgba(234,240,255,0.65)]">ملاحظات</span>
            <textarea
              className={inputClass + ' mt-1 min-h-[60px]'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {(contactStatus === 'تم التواصل' || contactStatus === 'تم الرد') && (
            <label className="block">
              <span className="text-xs text-[rgba(234,240,255,0.65)]">رد المرشح بعد التواصل</span>
              <textarea
                className={inputClass + ' mt-1 min-h-[70px]'}
                value={contactReply}
                onChange={(e) => setContactReply(e.target.value)}
              />
            </label>
          )}
          <label className="block">
            <span className="text-xs text-[rgba(234,240,255,0.65)]">قرار التشغيل بعد التواصل</span>
            <select
              className={inputClass + ' mt-1'}
              value={hiringDecision}
              onChange={(e) => setHiringDecision(e.target.value as Candidate['hiringDecision'])}
            >
              {HIRING_DECISION_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {hiringDecision === 'لن يشتغل' && (
            <label className="block">
              <span className="text-xs text-[rgba(234,240,255,0.65)]">سبب عدم التشغيل</span>
              <textarea
                className={inputClass + ' mt-1 min-h-[70px]'}
                value={notHiredReason}
                onChange={(e) => setNotHiredReason(e.target.value)}
              />
            </label>
          )}
          {hiringDecision === 'هيشتغل' && (
            <label className="block">
              <span className="text-xs text-[rgba(234,240,255,0.65)]">تاريخ المحاضرة</span>
              <input
                type="date"
                className={inputClass + ' mt-1'}
                value={lecturePlannedDate}
                onChange={(e) => setLecturePlannedDate(e.target.value)}
              />
            </label>
          )}
        </div>
        {error && <p className="text-[#FB7185] text-sm mt-2">{error}</p>}
        <div className="flex gap-2 mt-6 justify-end">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" onClick={submit} disabled={loading}>
            {loading ? 'جاري الحفظ...' : 'تسجيل'}
          </Button>
        </div>
      </div>
    </div>
  );
}
