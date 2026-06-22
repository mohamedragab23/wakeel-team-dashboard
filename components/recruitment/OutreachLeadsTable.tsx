'use client';

import { authFetch } from '@/lib/authFetch';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';
import Toast, { type ToastMessage } from '@/components/ui-v2/Toast';
import {
  HIRING_DECISION_VALUES,
  OFFICE_MANAGER_ASSIGNMENT_OPTION,
  VEHICLE_TYPE_VALUES,
  type OutreachLead } from '@/lib/recruitment/types';
import { ZONE_OPTIONS } from '@/lib/zones';

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF]';

export default function OutreachLeadsTable() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    vehicleType: 'موتوسيكل' as 'موتوسيكل' | 'عجلة',
    workedBefore: 'لا' as 'نعم' | 'لا',
    governorate: '',
    zone: ZONE_OPTIONS[0] as string,
    jobAd: 'عرض تعيين',
    assignedSupervisorCode: '',
    hiringDecision: 'قيد المراجعة' as 'قيد المراجعة' | 'هيشتغل' | 'لن يشتغل',
    notHiredReason: '',
    lecturePlannedDate: '',
    notes: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['recruitment', 'outreach-leads'],
    queryFn: async () => {
      const res = await authFetch('/api/recruitment/outreach');
      const json = await res.json();
      return json.success ? (json.data as OutreachLead[]) : [];
    } });

  const { data: supervisors = [] } = useQuery({
    queryKey: ['recruitment', 'operational-supervisors'],
    queryFn: async () => {
      const res = await authFetch('/api/recruitment/supervisors');
      const json = await res.json();
      return json.success ? (json.data as Array<{ code: string; name: string }>) : [];
    } });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['recruitment', 'outreach-leads'] });
  const showToast = (type: ToastMessage['type'], text: string) => setToast({ type, text });

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/recruitment/outreach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify(form) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الحفظ');
      setForm({
        fullName: '',
        phone: '',
        vehicleType: 'موتوسيكل',
        workedBefore: 'لا',
        governorate: '',
        zone: ZONE_OPTIONS[0] as string,
        jobAd: 'عرض تعيين',
        assignedSupervisorCode: '',
        hiringDecision: 'قيد المراجعة',
        notHiredReason: '',
        lecturePlannedDate: '',
        notes: '' });
      refetch();
      showToast('success', 'تمت إضافة داتا العرض بنجاح');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ';
      setError(msg);
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const updateDecision = async (lead: OutreachLead, decision: OutreachLead['hiringDecision']) => {
    const res = await authFetch(`/api/recruitment/outreach/${lead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiringDecision: decision,
        notHiredReason: decision === 'لن يشتغل' ? lead.notHiredReason : '' }) });
    const json = await res.json();
    if (!json.success) {
      showToast('error', json.error || 'فشل تحديث قرار التشغيل');
      return;
    }
    refetch();
    showToast('success', 'تم تحديث قرار التشغيل');
  };

  const convertToCandidate = async (id: string) => {
    const res = await authFetch(`/api/recruitment/outreach/${id}/convert`, {
      method: 'POST',
       });
    const json = await res.json();
    if (!json.success) {
      showToast('error', json.error || 'فشل التحويل');
      return;
    }
    refetch();
    queryClient.invalidateQueries({ queryKey: ['recruitment', 'candidates'] });
    showToast('success', 'تم تحويل السجل إلى مرشح');
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-bold mb-3">رفع داتا للمشرف للتواصل بالعروض</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className={inputClass} placeholder="الاسم" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input className={inputClass} placeholder="رقم التليفون" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <select className={inputClass} value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value as 'موتوسيكل' | 'عجلة' })}>
            {VEHICLE_TYPE_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className={inputClass} value={form.workedBefore} onChange={(e) => setForm({ ...form, workedBefore: e.target.value as 'نعم' | 'لا' })}>
            <option value="لا">ما اشتغلش قبل كده</option>
            <option value="نعم">اشتغل قبل كده</option>
          </select>
          <input className={inputClass} placeholder="المحافظة" value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })} />
          <select className={inputClass} value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>
            {ZONE_OPTIONS.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
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
          <input className={inputClass} placeholder="اسم/نوع الإعلان" value={form.jobAd} onChange={(e) => setForm({ ...form, jobAd: e.target.value })} />
          <textarea className={inputClass + ' md:col-span-3 min-h-[64px]'} placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {error ? <p className="text-[#FB7185] text-sm mt-2">{error}</p> : null}
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={submit} disabled={loading || !form.fullName || !form.phone || !form.governorate}>
            {loading ? 'جاري الحفظ...' : 'إضافة داتا عرض'}
          </Button>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        {isLoading ? (
          <p className="p-4">جاري التحميل...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.10)] text-[rgba(234,240,255,0.7)]">
                <th className="p-3 text-start">الاسم</th>
                <th className="p-3 text-start">الهاتف</th>
                <th className="p-3 text-start">الزون</th>
                <th className="p-3 text-start">المشرف</th>
                <th className="p-3 text-start">قرار التشغيل</th>
                <th className="p-3 text-start">تحويل</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-[rgba(255,255,255,0.06)]">
                  <td className="p-3">{lead.fullName}</td>
                  <td className="p-3">{lead.phone}</td>
                  <td className="p-3">{lead.zone}</td>
                  <td className="p-3">{lead.assignedSupervisorCode || '—'}</td>
                  <td className="p-3">
                    <select
                      className={inputClass + ' min-w-[150px]'}
                      value={lead.hiringDecision}
                      onChange={(e) => updateDecision(lead, e.target.value as OutreachLead['hiringDecision'])}
                    >
                      {HIRING_DECISION_VALUES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    {lead.convertedToCandidateId ? (
                      <span className="text-emerald-300 text-xs">تم التحويل</span>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => convertToCandidate(lead.id)}
                        disabled={lead.hiringDecision !== 'هيشتغل'}
                      >
                        تحويل لمرشح
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Toast message={toast} />
    </div>
  );
}

