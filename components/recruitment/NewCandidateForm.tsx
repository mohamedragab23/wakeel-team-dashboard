'use client';

import { authFetch } from '@/lib/authFetch';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '@/components/ui-v2/Button';
import Card from '@/components/ui-v2/Card';
import { ZONE_OPTIONS } from '@/lib/zones';
import {
  HIRING_DECISION_VALUES,
  OFFICE_MANAGER_ASSIGNMENT_OPTION,
  VEHICLE_TYPE_VALUES } from '@/lib/recruitment/types';

type Props = {
  onCreated: () => void;
};

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF]';

export default function NewCandidateForm({ onCreated }: Props) {
  const { data: supervisors = [] } = useQuery({
    queryKey: ['recruitment', 'operational-supervisors'],
    queryFn: async () => {
      const res = await authFetch('/api/recruitment/supervisors');
      const json = await res.json();
      return json.success ? (json.data as Array<{ code: string; name: string }>) : [];
    } });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    vehicleType: 'موتوسيكل' as 'موتوسيكل' | 'عجلة',
    workedBefore: 'لا' as 'نعم' | 'لا',
    governorate: '',
    zone: ZONE_OPTIONS[0] as string,
    jobAd: 'عرض تعيين جديد',
    assignedSupervisorCode: '',
    hiringDecision: 'قيد المراجعة' as 'قيد المراجعة' | 'هيشتغل' | 'لن يشتغل',
    notHiredReason: '',
    lecturePlannedDate: '',
    notes: '' });

  const canSubmit = useMemo(() => {
    if (!form.fullName.trim() || !form.phone.trim() || !form.governorate.trim()) return false;
    if (form.hiringDecision === 'لن يشتغل' && !form.notHiredReason.trim()) return false;
    if (form.hiringDecision === 'هيشتغل' && !form.lecturePlannedDate) return false;
    return true;
  }, [form]);

  const submit = async () => {
    setLoading(true);
    setError('');
    setOk('');
    try {
      const res = await authFetch('/api/recruitment/candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify(form) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الإضافة');
      setOk('تم إضافة بيانات التعيين الجديدة بنجاح');
      setForm({
        fullName: '',
        phone: '',
        vehicleType: 'موتوسيكل',
        workedBefore: 'لا',
        governorate: '',
        zone: ZONE_OPTIONS[0] as string,
        jobAd: 'عرض تعيين جديد',
        assignedSupervisorCode: '',
        hiringDecision: 'قيد المراجعة',
        notHiredReason: '',
        lecturePlannedDate: '',
        notes: '' });
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 md:p-5 space-y-3">
      <h3 className="font-bold text-lg">إضافة بيانات تعيين جديدة</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="الاسم">
          <input className={inputClass} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </Field>
        <Field label="رقم التليفون">
          <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="وسيلة العمل">
          <select className={inputClass} value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value as 'موتوسيكل' | 'عجلة' })}>
            {VEHICLE_TYPE_VALUES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="اشتغل في طلبات قبل كده؟">
          <select className={inputClass} value={form.workedBefore} onChange={(e) => setForm({ ...form, workedBefore: e.target.value as 'نعم' | 'لا' })}>
            <option value="لا">لا</option>
            <option value="نعم">نعم</option>
          </select>
        </Field>
        <Field label="من محافظة">
          <input className={inputClass} value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })} />
        </Field>
        <Field label="هيشتغل في زون">
          <select className={inputClass} value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>
            {ZONE_OPTIONS.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </Field>
        <Field label="المشرف المسؤول">
          <select
            className={inputClass}
            value={form.assignedSupervisorCode}
            onChange={(e) => setForm({ ...form, assignedSupervisorCode: e.target.value })}
          >
            <option value="">— بدون تحديد الآن —</option>
            <option value={OFFICE_MANAGER_ASSIGNMENT_OPTION}>سيتم التحديد من خلال مدير المكتب بعد التفعيل</option>
            {supervisors.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          {form.assignedSupervisorCode === OFFICE_MANAGER_ASSIGNMENT_OPTION && (
            <p className="text-xs text-[rgba(234,240,255,0.65)] mt-1">
              سيتمكن الأدمن من تحديد مشرف التشغيل بعد التفعيل من شاشة المتابعة.
            </p>
          )}
        </Field>
        <Field label="حالة التعيين">
          <select className={inputClass} value={form.hiringDecision} onChange={(e) => setForm({ ...form, hiringDecision: e.target.value as 'قيد المراجعة' | 'هيشتغل' | 'لن يشتغل' })}>
            {HIRING_DECISION_VALUES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        {form.hiringDecision === 'لن يشتغل' && (
          <Field label="لو لا.. ليه؟" className="md:col-span-2">
            <textarea className={inputClass + ' min-h-[72px]'} value={form.notHiredReason} onChange={(e) => setForm({ ...form, notHiredReason: e.target.value })} />
          </Field>
        )}
        {form.hiringDecision === 'هيشتغل' && (
          <Field label="ميعاد المحاضرة (تاريخ)" className="md:col-span-2">
            <input type="date" className={inputClass} value={form.lecturePlannedDate} onChange={(e) => setForm({ ...form, lecturePlannedDate: e.target.value })} />
          </Field>
        )}
        <Field label="ملاحظات" className="md:col-span-2">
          <textarea className={inputClass + ' min-h-[72px]'} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>

      {error ? <p className="text-[#FB7185] text-sm">{error}</p> : null}
      {ok ? <p className="text-emerald-300 text-sm">{ok}</p> : null}

      <div className="flex justify-end">
        <Button variant="primary" onClick={submit} disabled={loading || !canSubmit}>
          {loading ? 'جاري الحفظ...' : 'إضافة تعيين جديد'}
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  children,
  className = '' }: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-[rgba(234,240,255,0.65)] mb-1 block">{label}</span>
      {children}
    </label>
  );
}

